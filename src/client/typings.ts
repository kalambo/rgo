export interface Auth {
  user: string | null;
  getToken: () => string | null;
  logout: () => void;
}
