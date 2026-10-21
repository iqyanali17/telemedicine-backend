import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env.js';

export const generateTestToken = ({ id, email, role }) => {
  return jwt.sign(
    { sub: id, email, role },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' }
  );
};

export const getAuthHeader = (user) => {
  const token = generateTestToken(user);
  return { Authorization: `Bearer ${token}` };
};
