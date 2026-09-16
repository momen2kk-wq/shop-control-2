# Deploy Shop Control free on Render

This project is prepared for a free Render web service.

## 1. Put the project on GitHub
Create a GitHub repository and upload the contents of this folder. Do not upload `node_modules` or `data/`.

## 2. Deploy on Render
In Render, create a **New Blueprint** and select the GitHub repository. Render will read `render.yaml` and create the service.

The service will build with:
```
npm install && npm run build
```
and start with:
```
npm start
```

## 3. Your URL
After deployment, Render gives you a free HTTPS URL similar to:
`https://shop-control-xxxx.onrender.com`

## Important free-tier limitation
The current app uses SQLite. Render's free web-service filesystem is ephemeral, so this deployment is suitable for testing/demo use, not permanent business records. For real customer data, move the database to PostgreSQL (or another persistent managed database) before relying on the service.

## Android
Once the URL works, open it in Chrome on Android and use Chrome's **Add to Home screen / Install app** option if offered.
