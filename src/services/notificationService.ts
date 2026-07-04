import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import path from 'path';
import fs from 'fs';
import { User } from '../models/User';
import { Notification } from '../models/Notification';
import { getNotificationConfig, NotificationType } from './notificationRegistry';

// Initialize Firebase Admin SDK
try {
  if (getApps().length === 0) {
    // const serviceAccountPath = path.resolve(__dirname, '../../attendancepro-f738f-firebase-adminsdk-fbsvc-f684bd8d53.json');
    // if (fs.existsSync(serviceAccountPath)) {
    // const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON!);
    initializeApp({
      credential: cert(serviceAccount),
    });
    console.log('[Firebase] Admin SDK initialized successfully.');
    // } else {
    //   console.warn(`[Firebase] Service account file not found at ${serviceAccountPath}. Push notifications will be disabled.`);
    // }
  }
} catch (err) {
  console.error('[Firebase] Failed to initialize Firebase Admin SDK:', err);
}

/**
 * Sends a notification to a single user.
 * Error isolated - will never throw upwards.
 */
export async function notifyUser(userId: any, type: NotificationType, data: any, saveInDb = true): Promise<void> {
  try {
    const config = getNotificationConfig(type, data);
    const user = await User.findById(userId).lean();
    if (!user) {
      console.warn(`[Notification] User not found: ${userId}`);
      return;
    }

    // 1. Create in-app notification if appNotificationsEnabled is not false and saveInDb is true
    if (user.appNotificationsEnabled !== false && saveInDb) {
      try {
        const notification = new Notification({
          userId: user._id,
          title: config.title,
          message: config.message,
          type,
          data,
          status: 'unread',
        });
        await notification.save();
        console.log(`[Notification] In-app notification saved for user ${user._id} (${type})`);
      } catch (dbErr) {
        console.error(`[Notification] Database write failed for user ${user._id}:`, dbErr);
      }
    }

    // 2. Check preferences for Push Notification
    const pushEnabledGlobal = user.pushNotificationsEnabled !== false;
    const categoryPreferences = user.notificationPreferences || {};
    const categoryEnabled = (categoryPreferences as any)[config.category] !== false;

    if (!pushEnabledGlobal || !categoryEnabled) {
      console.log(`[Notification] Push notification muted for user ${user._id}. Global: ${pushEnabledGlobal}, Category (${config.category}): ${categoryEnabled}`);
      return;
    }

    const tokens = user.pushTokens || [];
    if (tokens.length === 0) {
      console.log(`[Notification] No push tokens registered for user ${user._id}`);
      return;
    }

    if (getApps().length === 0) {
      console.warn('[Notification] Firebase Admin SDK is not initialized. Skipping push send.');
      return;
    }

    // Send push message to all device tokens of user
    const messages = tokens.map((t: any) => ({
      token: t.token,
      notification: {
        title: config.title,
        body: config.message,
      },
      data: {
        type,
        deepLink: config.link,
        ...Object.entries(data || {}).reduce((acc, [k, v]) => {
          acc[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
          return acc;
        }, {} as Record<string, string>),
      },
      android: {
        notification: {
          sound: 'default',
          channelId: 'high_priority',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
          },
        },
      },
    }));

    const response = await getMessaging().sendEach(messages);
    let successCount = 0;
    let failureCount = 0;
    const tokensPruned: string[] = [];

    response.responses.forEach((res: any, index: number) => {
      const currentTokenObj = tokens[index];
      if (res.success) {
        successCount++;
      } else {
        failureCount++;
        const errorCode = res.error?.code;
        console.error(`[Notification] Failed to send push to device ${currentTokenObj.deviceId} (${currentTokenObj.platform}):`, res.error);
        if (
          errorCode === 'messaging/invalid-registration-token' ||
          errorCode === 'messaging/registration-token-not-registered'
        ) {
          tokensPruned.push(currentTokenObj.token);
        }
      }
    });

    console.log(`[Notification] Type: ${type}, Recipient: ${user._id}, Succeeded: ${successCount}, Failed: ${failureCount}, Pruned tokens: ${tokensPruned.length}`);

    // Prune invalid tokens
    if (tokensPruned.length > 0) {
      try {
        await User.updateOne(
          { _id: user._id },
          { $pull: { pushTokens: { token: { $in: tokensPruned } } } }
        );
        console.log(`[Notification] Pruned ${tokensPruned.length} invalid tokens for user ${user._id}`);
      } catch (pruneErr) {
        console.error(`[Notification] Failed to prune invalid tokens for user ${user._id}:`, pruneErr);
      }
    }
  } catch (err) {
    console.error(`[Notification] Fatal error in notifyUser:`, err);
  }
}

/**
 * Sends a notification to multiple users.
 * Processes in-app records per-user, filters out users with muted preferences,
 * gathers push tokens, chunks them into batches of 500, and sends via Firebase Admin.
 * Error isolated - will never throw upwards.
 */
export async function notifyUsers(userIds: any[], type: NotificationType, data: any, saveInDb = true): Promise<void> {
  try {
    const config = getNotificationConfig(type, data);
    const users = await User.find({ _id: { $in: userIds } }).lean();

    if (users.length === 0) {
      console.log(`[Notification] No recipients found for notifyUsers (${type})`);
      return;
    }

    const tokensToSend: Array<{ token: string; userId: any; deviceId: string; platform: string }> = [];
    let inAppCount = 0;

    for (const user of users) {
      // 1. Create in-app notification if appNotificationsEnabled is not false and saveInDb is true
      if (user.appNotificationsEnabled !== false && saveInDb) {
        try {
          const notification = new Notification({
            userId: user._id,
            title: config.title,
            message: config.message,
            type,
            data,
            status: 'unread',
          });
          await notification.save();
          inAppCount++;
        } catch (dbErr) {
          console.error(`[Notification] Database write failed for user ${user._id}:`, dbErr);
        }
      }

      // 2. Check preferences for Push Notification
      const pushEnabledGlobal = user.pushNotificationsEnabled !== false;
      const categoryPreferences = user.notificationPreferences || {};
      const categoryEnabled = (categoryPreferences as any)[config.category] !== false;

      if (pushEnabledGlobal && categoryEnabled) {
        const userTokens = user.pushTokens || [];
        userTokens.forEach((t: any) => {
          tokensToSend.push({
            token: t.token,
            userId: user._id,
            deviceId: t.deviceId,
            platform: t.platform,
          });
        });
      }
    }

    console.log(`[Notification] In-app records created: ${inAppCount}/${users.length} users`);

    if (tokensToSend.length === 0) {
      console.log(`[Notification] No push tokens to send for notifyUsers (${type})`);
      return;
    }

    if (getApps().length === 0) {
      console.warn('[Notification] Firebase Admin SDK is not initialized. Skipping push sends.');
      return;
    }

    // Firebase sendEach limit is 500 messages per call
    const CHUNK_SIZE = 500;
    let totalSuccess = 0;
    let totalFailure = 0;
    const tokensToPruneByUser: Record<string, string[]> = {};

    for (let i = 0; i < tokensToSend.length; i += CHUNK_SIZE) {
      const chunk = tokensToSend.slice(i, i + CHUNK_SIZE);
      const messages = chunk.map((c) => ({
        token: c.token,
        notification: {
          title: config.title,
          body: config.message,
        },
        data: {
          type,
          deepLink: config.link,
          ...Object.entries(data || {}).reduce((acc, [k, v]) => {
            acc[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
            return acc;
          }, {} as Record<string, string>),
        },
        android: {
          notification: {
            sound: 'default',
            channelId: 'high_priority',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
            },
          },
        },
      }));

      try {
        const response = await getMessaging().sendEach(messages);
        response.responses.forEach((res: any, index: number) => {
          const item = chunk[index];
          if (res.success) {
            totalSuccess++;
          } else {
            totalFailure++;
            const errorCode = res.error?.code;
            console.error(`[Notification] Failed to send push to user ${item.userId} device ${item.deviceId}:`, res.error);
            if (
              errorCode === 'messaging/invalid-registration-token' ||
              errorCode === 'messaging/registration-token-not-registered'
            ) {
              const userIdStr = String(item.userId);
              if (!tokensToPruneByUser[userIdStr]) {
                tokensToPruneByUser[userIdStr] = [];
              }
              tokensToPruneByUser[userIdStr].push(item.token);
            }
          }
        });
      } catch (chunkErr) {
        console.error(`[Notification] Fatal error sending chunk starting at ${i}:`, chunkErr);
      }
    }

    console.log(`[Notification] Type: ${type}, Total Receivers: ${users.length}, Total Succeeded: ${totalSuccess}, Total Failed: ${totalFailure}`);

    // Prune invalid tokens
    const prunePromises = Object.entries(tokensToPruneByUser).map(async ([userIdStr, tokensToPull]) => {
      try {
        await User.updateOne(
          { _id: userIdStr },
          { $pull: { pushTokens: { token: { $in: tokensToPull } } } }
        );
        console.log(`[Notification] Pruned ${tokensToPull.length} invalid tokens for user ${userIdStr}`);
      } catch (pruneErr) {
        console.error(`[Notification] Failed to prune invalid tokens for user ${userIdStr}:`, pruneErr);
      }
    });

    await Promise.all(prunePromises);
  } catch (err) {
    console.error(`[Notification] Fatal error in notifyUsers:`, err);
  }
}
