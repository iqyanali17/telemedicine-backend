import { describe, it, expect } from 'vitest';
import { registerSchema, loginSchema } from '../../src/modules/auth/auth.validation.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';

describe('Auth Validation Schemas', () => {
  it('should validate valid registration payload', () => {
    const validData = {
      email: 'khwajaiqyan@gmail.com',
      password: 'SecurePassword123!',
      firstName: 'John',
      lastName: 'Doe',
      role: 'PATIENT',
      phone: '9899312345',
    };

    const result = registerSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should reject names containing numbers (e.g. iqyan2 or ali2)', () => {
    const withInvalidFirstName = registerSchema.safeParse({
      email: 'khwajaiqyan@gmail.com',
      password: 'SecurePassword123!',
      firstName: 'iqyan2',
      lastName: 'Ali',
    });
    expect(withInvalidFirstName.success).toBe(false);
    expect(withInvalidFirstName.error.issues[0].message).toMatch(/cannot contain numbers/i);

    const withInvalidLastName = registerSchema.safeParse({
      email: 'khwajaiqyan@gmail.com',
      password: 'SecurePassword123!',
      firstName: 'Iqyan',
      lastName: 'ali2',
    });
    expect(withInvalidLastName.success).toBe(false);
    expect(withInvalidLastName.error.issues[0].message).toMatch(/cannot contain numbers/i);
  });

  it('should reject phone numbers that are not 10 digits (e.g. 98993)', () => {
    const invalidPhone = registerSchema.safeParse({
      email: 'khwajaiqyan@gmail.com',
      password: 'SecurePassword123!',
      firstName: 'Iqyan',
      lastName: 'Ali',
      phone: '98993',
    });
    expect(invalidPhone.success).toBe(false);
    expect(invalidPhone.error.issues[0].message).toMatch(/10-digit/i);
  });

  it('should reject password missing special symbol (e.g. Iqyan123)', () => {
    const noSymbolPassword = registerSchema.safeParse({
      email: 'khwajaiqyan@gmail.com',
      password: 'Iqyan123',
      firstName: 'Iqyan',
      lastName: 'Ali',
    });
    expect(noSymbolPassword.success).toBe(false);
    expect(noSymbolPassword.error.issues[0].message).toMatch(/symbol/i);
  });

  it('should reject email missing @ symbol', () => {
    const noAtEmail = registerSchema.safeParse({
      email: 'khwajaiqyangmail.com',
      password: 'SecurePassword123!',
      firstName: 'Iqyan',
      lastName: 'Ali',
    });
    expect(noAtEmail.success).toBe(false);
    expect(noAtEmail.error.issues[0].message).toMatch(/@/);
  });

  it('should reject weak password in registration', () => {
    const invalidData = {
      email: 'test@example.com',
      password: 'weak',
      firstName: 'John',
      lastName: 'Doe',
    };

    const result = registerSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should reject invalid email in login schema', () => {
    const invalidData = {
      email: 'not-an-email',
      password: 'SomePassword123',
    };

    const result = loginSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });
});

describe('AuthService Token Generation', () => {
  it('should generate valid access and refresh tokens for user', () => {
    const mockUser = {
      id: 'user-uuid-123',
      email: 'doctor@example.com',
      role: 'DOCTOR',
    };

    const tokens = AuthService.generateTokens(mockUser);
    expect(tokens).toHaveProperty('accessToken');
    expect(tokens).toHaveProperty('refreshToken');
    expect(typeof tokens.accessToken).toBe('string');
    expect(typeof tokens.refreshToken).toBe('string');
  });
});
