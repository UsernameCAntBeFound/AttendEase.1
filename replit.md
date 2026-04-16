# AttendEase

A web-based school attendance management system with role-based dashboards for students, teachers, and administrators.

## Project Overview

AttendEase allows:
- **Students** to scan QR codes to check in/out of classes
- **Teachers** to manage class schedules and view attendance reports
- **Admins** to manage user accounts (create, edit, archive)

## Technologies

- **Frontend:** Pure HTML5, CSS3, and vanilla JavaScript (ES6+) — no framework
- **Storage:** localStorage for client-side data with optional cloud sync to Neon PostgreSQL via a Render-hosted proxy API
- **Icons/Fonts:** SVG icons and Google Fonts (Quicksand)
- **Theme:** iOS-style liquid glass effect — animated gradient orbs, frosted glass panels (backdrop-filter blur), warm beige color palette (#e8e2d9 base, #2d2f33 brand)

## Project Structure

| File | Description |
|------|-------------|
| `index.html` / `index.css` | Login page |
| `adminPanel.html` / `adminPanel.css` | Admin dashboard |
| `teacherDashboard.html` / `teacherDashboard.css` | Teacher interface |
| `studentDashboard.html` / `studentDashboard.css` | Student interface |
| `db.js` | localStorage database logic, seeding, and auth |
| `cloud-sync.js` | Cloud sync to remote PostgreSQL via proxy API |

## Demo Credentials

- **Admin:** admin / admin123
- **Teacher:** ms.santos / teacher01
- **Student:** juan.dc / pass1234

## Running Locally

Served as a static site using Python's built-in HTTP server:
```
python3 -m http.server 5000 --bind 0.0.0.0
```

## Deployment

Configured as a static site deployment with `publicDir: "."`.
