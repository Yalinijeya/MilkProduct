// Production settings — used by `ng build` (production is the default configuration).
// The Cloudflare Worker serves this app and the API from the same domain, so apiUrl is ''.
export const environment = {
  production: true,
  apiUrl: '',
  currency: 'LKR',
  currencySymbol: 'Rs. ',
  locale: 'en-LK',
};
