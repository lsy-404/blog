export const formatBlogDate = (date, locale, options) =>
  new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(date);

export const getBlogYear = (date) => date.getUTCFullYear();
