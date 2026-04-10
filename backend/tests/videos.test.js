const request = require('supertest');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const app = require('../src/app');
const User = require('../src/models/User');

let authToken;
let testVideoId;

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pulse_video_test_videos');

  const regRes = await request(app).post('/api/auth/register').send({
    username: 'videoeditor',
    email: 'editor@example.com',
    password: 'password123',
  });
  authToken = regRes.body.token;
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('Videos API', () => {
  it('should return empty video list', async () => {
    const res = await request(app)
      .get('/api/videos')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeInstanceOf(Array);
  });

  it('should reject unauthenticated video list request', async () => {
    const res = await request(app).get('/api/videos');
    expect(res.statusCode).toBe(401);
  });

  it('should return 404 for non-existent video', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .get(`/api/videos/${fakeId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.statusCode).toBe(404);
  });
});
