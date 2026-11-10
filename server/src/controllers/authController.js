const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const db = require('../config/db');

// Input Validation Schemas
const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { userId },
    process.env.JWT_ACCESS_SECRET || 'super_secret_access_token_key',
    { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m' }
  );

  const refreshToken = jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET || 'super_secret_refresh_token_key',
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );

  return { accessToken, refreshToken };
};

const register = async (req, res) => {
  try {
    const validatedData = registerSchema.parse(req.body);

    // Check if user already exists
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [validatedData.email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'A user with this email address already exists.' });
    }

    // Hash password with bcrypt
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(validatedData.password, salt);

    // Avatar generation
    const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(validatedData.name)}`;

    const result = await db.query(
      `INSERT INTO users (name, email, password_hash, avatar_url)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, avatar_url, created_at`,
      [validatedData.name, validatedData.email, passwordHash, avatarUrl]
    );

    const newUser = result.rows[0];
    const { accessToken, refreshToken } = generateTokens(newUser.id);

    // Set refresh token in httpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.status(201).json({
      message: 'User registered successfully',
      user: newUser,
      accessToken,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Registration error:', error);
    res.status(500).json({ error: error.message || 'Internal server error during registration.' });
  }
};

const login = async (req, res) => {
  try {
    const validatedData = loginSchema.parse(req.body);

    const result = await db.query(
      'SELECT id, name, email, password_hash, avatar_url FROM users WHERE email = $1',
      [validatedData.email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = result.rows[0];
    const isPasswordValid = await bcrypt.compare(validatedData.password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const { accessToken, refreshToken } = generateTokens(user.id);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // Don't return password hash
    delete user.password_hash;

    res.json({
      message: 'Login successful',
      user,
      accessToken,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error during login.' });
  }
};

const refresh = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ error: 'No refresh token provided.' });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || 'super_secret_refresh_token_key');

    const result = await db.query('SELECT id, name, email, avatar_url FROM users WHERE id = $1', [decoded.userId]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found.' });
    }

    const user = result.rows[0];
    const tokens = generateTokens(user.id);

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      accessToken: tokens.accessToken,
      user,
    });
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired refresh token.' });
  }
};

const logout = (req, res) => {
  res.clearCookie('refreshToken');
  res.json({ message: 'Logged out successfully.' });
};

const getMe = async (req, res) => {
  res.json({ user: req.user });
};

const updateProfileSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100).optional(),
  avatar_url: z
    .union([z.literal(''), z.string().trim().url('Avatar must be a valid URL').max(500)])
    .optional(),
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(6, 'New password must be at least 6 characters').optional(),
});

const updateProfile = async (req, res) => {
  try {
    const data = updateProfileSchema.parse(req.body);
    if (data.newPassword && !data.currentPassword) {
      return res.status(400).json({ error: 'Current password is required to set a new password.' });
    }

    const userRes = await db.query(
      'SELECT id, name, email, avatar_url, password_hash FROM users WHERE id = $1',
      [req.user.id]
    );
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const existing = userRes.rows[0];

    let nextHash = existing.password_hash;
    if (data.newPassword) {
      const valid = await bcrypt.compare(data.currentPassword, existing.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Current password is incorrect.' });
      }
      const salt = await bcrypt.genSalt(12);
      nextHash = await bcrypt.hash(data.newPassword, salt);
    }

    const updated = await db.query(
      `UPDATE users
       SET name = $1,
           avatar_url = $2,
           password_hash = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING id, name, email, avatar_url`,
      [
        data.name || existing.name,
        data.avatar_url !== undefined ? data.avatar_url : existing.avatar_url,
        nextHash,
        req.user.id,
      ]
    );

    res.json({ user: updated.rows[0], message: 'Profile updated successfully.' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
};

module.exports = {
  register,
  login,
  refresh,
  logout,
  getMe,
  updateProfile,
};
