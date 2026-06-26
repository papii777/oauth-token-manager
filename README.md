# Enterprise Microsoft 365 OAuth Token Management System

A complete enterprise IT administration tool for managing multiple Microsoft 365 OAuth tokens with dual deployment architecture.

## 🚀 Features

- **OAuth 2.0 Authorization Flow** with Azure AD
- **Token Lifecycle Management** with automatic refresh
- **Admin Dashboard** for managing multiple accounts
- **Microsoft Graph API Integration** for email access
- **Telegram Notifications** for admin alerts
- **Dual Deployment**: Cloudflare Workers + Render

## 📋 System Architecture

### Cloudflare Workers - OAuth Authorization Handler
Handles OAuth 2.0 flow, captures tokens, and forwards to Render dashboard.

### Render Dashboard - Admin Management System
Centralized admin panel with PostgreSQL for token storage and management.

## 🛠️ Tech Stack

- **Backend**: Node.js, Express
- **Frontend**: React
- **Database**: PostgreSQL
- **OAuth**: Azure AD / Microsoft 365
- **Deployment**: Cloudflare Workers + Render
- **Notifications**: Telegram Bot API

## 📦 Setup Instructions

Coming soon...

## 🔐 Environment Variables

See `.env.example` files in respective directories.

## 📖 Documentation

- [Cloudflare Workers Setup](./cloudflare-worker/README.md)
- [Render Dashboard Setup](./server/README.md)

## 📄 License

MIT
