// Development settings — used by `ng serve`.
// API calls go to the same origin; proxy.conf.json forwards /api and /uploads to `wrangler dev` (port 8787).
export const environment = {
  production: false,
  apiUrl: '',
  currency: 'LKR',
  currencySymbol: 'Rs. ',
  locale: 'en-LK',
};
