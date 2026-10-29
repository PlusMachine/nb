export const PASSWORD_MIN_LENGTH = 15;
export const PASSWORD_MAX_LENGTH = 128;

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

// Ограничение применяется и к старым паролям при входе, без нового минимума:
// существующий пользователь должен суметь войти и заменить короткий пароль.
export const isPasswordInputAllowed = (password: string): boolean =>
  password.length > 0
  && password.length <= PASSWORD_MAX_LENGTH * 2
  && Array.from(password).length <= PASSWORD_MAX_LENGTH;

export const assertNewPassword = (password: string): void => {
  if (!isPasswordInputAllowed(password)
    || Array.from(password).length < PASSWORD_MIN_LENGTH
    || !password.trim()) {
    throw new Error("INVALID_PASSWORD");
  }
};
