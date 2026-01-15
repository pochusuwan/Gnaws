# Gnaws Mock Server

Implements POST /call with { method, params } to match the frontend.

## Run
From tools/mock-server:
npm start

## Configure frontend
Set API_BASE in your frontend config.js to:
http://localhost:8080/

## Frontend origin (CORS)
If your frontend isn't served from http://localhost:5173, run:
FRONTEND_ORIGIN=http://localhost:5500 npm start