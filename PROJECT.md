# Instructions for AI

Follow clean architecture.
Use modular Fastify plugins.
Keep code scalable and production-ready.

# App Overview

This is an employee attendance and task tracking app.

Roles:

- Employee
- Admin

Core Features:

- GPS-based attendance (check-in/check-out)
- Daily task tracking
- Admin dashboard for employee management and reports

# Roles

## Employee

- Check-in / Check-out using GPS
- Add and update daily todos
- View attendance history
- View task history

## Admin

- Add employees
- View employee list
- View attendance stats
- View employee details (attendance + tasks)

# Feature Flows

## Attendance Flow

1. User taps Check-In
2. App sends latitude and longitude
3. Backend validates radius
4. If valid → mark present
5. Else → reject

## Todo Flow

1. User adds task
2. Task saved with date
3. User marks complete/pending

## Admin Flow

1. Admin views dashboard
2. Sees total employees, present, absent
3. Can open employee details

# API Requirements

## Auth

POST /auth/login

## Attendance

POST /attendance/check-in
POST /attendance/check-out
GET /attendance/history

## Todo

POST /todo
PATCH /todo/:id
GET /todo?filter=daily|weekly|monthly

## Admin

POST /admin/employee
GET /admin/employees
GET /admin/stats
GET /admin/employee/:id

# Data Models

## User

- name
- email
- password
- role (employee/admin)

## Attendance

- userId
- date
- checkInTime
- checkOutTime
- latitude
- longitude

## Todo

- userId
- task
- status (pending/completed)
- date

# Business Rules

- User can check-in only once per day
- Check-in allowed only within office radius
- Check-out only after check-in
- Tasks are tied to a specific date
- Admin-only routes must be protected

# Addons

- User on onbaording screen in the signup should have two option either create account as ADMIN or EMPLOYEE.
- For ADMIN
  Multi Step form (first normal user details like name, email, password, confirm password, then 2nd step create organization where it's name, addressName, location and radius)
  on Submit will create a user with role ADMIN and create a organization and also add one more unique orgCode and assign that org to the ADMIN then user navigated to (admin)/
- For Employee
  Multi Step Form (first normal user details like name, email, password, confirm password, then 2nd step will be organization code (unique) so that the employee can be directly be added in that organization as an Employee so first check the orgCode is valid or not then continue)
  on Submit will create a user with role EMPLOYEE and add the user to the organziation which code it was.
