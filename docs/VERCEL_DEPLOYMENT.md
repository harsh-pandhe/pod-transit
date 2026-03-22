# Vercel Deployment Guide

## Ready State

This project is configured for Vercel with:
- `vercel.json` using Vite build output (`dist`)
- GitHub Actions CI at `.github/workflows/ci.yml`
- Node 18 compatibility via `package.json` engines

## Deploy via GitHub (Recommended)

1. Push this repository to GitHub.
2. In Vercel, click **Add New Project**.
3. Import this GitHub repository.
4. Confirm settings:
   - Framework Preset: `Vite`
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm ci`
5. Click **Deploy**.

## Environment Variables

Frontend deploy does not require secrets by default.
If you later expose backend endpoints or feature flags, add variables in:
- Vercel Project Settings -> Environment Variables

## Pre-Push Checklist

- `npm ci`
- `npm test`
- `npm run build`
- Ensure no local secrets are committed (`.env` should remain local).

## Notes

- The Express backend (`src/api/app.js`) is not deployed as a Vercel serverless API in this setup.
- Current Vercel config deploys the Vite frontend only.
