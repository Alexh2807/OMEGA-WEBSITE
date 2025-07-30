# OMEGA Website

This repository contains the source code for the **OMEGA** showcase and ecommerce site. The project is built with [Vite](https://vitejs.dev/), [React](https://react.dev/), [TypeScript](https://www.typescriptlang.org/) and [Tailwind CSS](https://tailwindcss.com/). It provides a public storefront for OMEGA products as well as an admin interface for managing orders, users and billing.

## Project Structure

- `src/` – React components and pages
- `supabase/` – Edge functions and database migrations
- `public/` – Static assets served by the website

## Environment Variables

Create a `.env` file at the project root (or configure your deployment platform) with the following variables:

```env
# Public keys for the frontend (used by Vite)
VITE_SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
VITE_SUPABASE_ANON_KEY="public-anon-key"
VITE_STRIPE_PUBLISHABLE_KEY="pk_test_..."

# Secrets for Edge Functions
SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="service-role-key"
STRIPE_SECRET_KEY="sk_test_..."
```

These keys allow the app to communicate with Supabase and Stripe both from the client and inside Supabase Edge Functions.

## Useful Commands

- `npm run dev` – start the development server
- `npm run build` – produce a production build
- `npm run lint` – run ESLint against the project
- `npm run preview` – preview the production build locally

Deployment usually consists of building the project and then serving the generated `dist/` folder (for example on Vercel or Netlify) and deploying the functions with `supabase functions deploy`.

## Legal Documents

The site links to OMEGA's [Privacy Policy](./public/privacy-policy.pdf) and [Terms of Use](./public/terms-of-use.pdf) from the footer. Update those documents to match your organisation's legal requirements.

