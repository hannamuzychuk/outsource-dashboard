# Employee & Project Dashboard

Vanilla JavaScript application for managing employees, projects, assignments, capacity, vacation days, and monthly planning snapshots.

## Features

- Monthly snapshots (`YYYY-M`) with independent data per month/year.
- Employee management: add, delete, update position/salary, availability calendar.
- Project management: add, delete, capacity tracking, employee details.
- Assignment management: assign/edit/unassign with capacity and fit sliders.
- Financial calculations: effective capacity, revenue, cost, project/employee profit.
- Sorting and filtering in Projects and Employees views.
- Seed Data workflow: copy full month data into current month and clear vacations.
- Local persistence in `localStorage` key `monthlyData`.

## Tech Stack

- HTML5
- CSS3
- Vanilla JavaScript (ES6)
- `localStorage` for persistence

## Run

1. Open project folder.
2. Open `index.html` in browser directly.
3. Optional: run local static server, e.g.:
   - `python3 -m http.server 8080`
   - open `http://localhost:8080`

## Notes

- Application starts with sample data if `monthlyData` does not exist.
- Salary, budget and income values are displayed with 2 decimal places.
- Effective capacity uses formula: `capacity × fit × vacationCoefficient`.
