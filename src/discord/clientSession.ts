// Session token of the current page load. Memory only: cookies and storage in
// Discord's iframe are partitioned or blocked on several platforms.
let token: string | null = null;

export const getSessionToken = () => token;
export const setSessionToken = (t: string | null) => {
  token = t;
};
