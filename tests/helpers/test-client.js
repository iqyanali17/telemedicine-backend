import supertest from 'supertest';
import app from '../../src/app.js';

export const request = supertest(app);
