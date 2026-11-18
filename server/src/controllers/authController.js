const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../config/db');

// Multer storage configuration for profile avatar photos
const AVATARS_DIR = path.resolve(__dirname, '../../uploads/avatars');
if (!fs.existsSync(AVATARS_DIR)) {
  fs.mkdirSync(AVATARS_DIR, { recursive: true });
}

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, AVATARS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    const cleanExt = ext.replace(/[^a-zA-Z0-9.]/g, '').toLowerCase();
    cb(null, `avatar-${req.user ? req.user.id : 'anon'}-${Date.now()}${cleanExt}`);
  },
});

const uploadAvatarMiddleware = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter: (req, file, cb) => {
    if (/image\/(jpeg|png|webp|gif|svg\+xml)/.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, WebP, GIF, SVG) are allowed for profile photos.'));
    }
  },
});

// Input Validation Schemas
const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  gender: z.enum(['male', 'female', 'prefer_not_to_say', 'other']).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
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
    const cleanEmail = validatedData.email.trim().toLowerCase();

    // Check if user already exists
    const existing = await db.query('SELECT id FROM users WHERE LOWER(TRIM(email)) = $1', [cleanEmail]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'A user with this email address already exists.' });
    }

    // Hash password with bcrypt
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(validatedData.password, salt);

    // Avatar generation
    const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(validatedData.name)}`;
    const gender = validatedData.gender || 'prefer_not_to_say';

    const result = await db.query(
      `INSERT INTO users (name, email, password_hash, avatar_url, gender)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, avatar_url, gender, phone, bio, theme_preference, notification_preferences, created_at, updated_at`,
      [validatedData.name, cleanEmail, passwordHash, avatarUrl, gender]
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
    const cleanEmail = validatedData.email.trim().toLowerCase();

    const result = await db.query(
      `SELECT id, name, email, password_hash, avatar_url, gender, phone, bio, theme_preference, notification_preferences, created_at, updated_at
       FROM users WHERE LOWER(TRIM(email)) = $1`,
      [cleanEmail]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = result.rows[0];
    let isPasswordValid = await bcrypt.compare(validatedData.password, user.password_hash);
    if (!isPasswordValid && validatedData.password) {
      const trimmed = validatedData.password.trim();
      isPasswordValid = (await bcrypt.compare(trimmed, user.password_hash)) ||
                        (await bcrypt.compare(trimmed.toLowerCase(), user.password_hash));
    }
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Update last_active_at
    await db.query('UPDATE users SET last_active_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

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

    const result = await db.query(
      `SELECT id, name, email, avatar_url, gender, phone, bio, theme_preference, notification_preferences, created_at, updated_at
       FROM users WHERE id = $1`,
      [decoded.userId]
    );
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

const logoutAll = async (req, res) => {
  res.clearCookie('refreshToken');
  try {
    if (req.user && req.user.id) {
      await db.query('UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [req.user.id]);
    }
    res.json({ message: 'Logged out from all sessions successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to complete logout.' });
  }
};

const getMe = async (req, res) => {
  res.json({ user: req.user });
};

const updateProfileSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100).optional(),
  avatar_url: z.string().trim().optional(),
  gender: z.enum(['male', 'female', 'prefer_not_to_say', 'other']).optional(),
  phone: z.string().trim().max(50).optional().nullable(),
  bio: z.string().trim().max(1000).optional().nullable(),
  theme_preference: z.enum(['light', 'dark']).optional(),
  notification_preferences: z.record(z.boolean()).optional(),
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
      'SELECT id, name, email, avatar_url, gender, phone, bio, theme_preference, notification_preferences, password_hash FROM users WHERE id = $1',
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

    const nextGender = data.gender !== undefined ? data.gender : (existing.gender || 'prefer_not_to_say');
    const nextPhone = data.phone !== undefined ? data.phone : existing.phone;
    const nextBio = data.bio !== undefined ? data.bio : existing.bio;
    const nextTheme = data.theme_preference !== undefined ? data.theme_preference : (existing.theme_preference || 'light');
    const nextNotifs = data.notification_preferences !== undefined 
      ? JSON.stringify(data.notification_preferences) 
      : (typeof existing.notification_preferences === 'string' ? existing.notification_preferences : JSON.stringify(existing.notification_preferences || {}));

    const updated = await db.query(
      `UPDATE users
       SET name = $1,
           avatar_url = $2,
           gender = $3,
           phone = $4,
           bio = $5,
           theme_preference = $6,
           notification_preferences = $7::jsonb,
           password_hash = $8,
           last_active_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $9
       RETURNING id, name, email, avatar_url, gender, phone, bio, theme_preference, notification_preferences, created_at, updated_at`,
      [
        data.name !== undefined ? data.name : existing.name,
        data.avatar_url !== undefined ? data.avatar_url : existing.avatar_url,
        nextGender,
        nextPhone,
        nextBio,
        nextTheme,
        nextNotifs,
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

const uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded.' });
    }
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    const updated = await db.query(
      `UPDATE users
       SET avatar_url = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, name, email, avatar_url, gender, phone, bio, theme_preference, notification_preferences, created_at, updated_at`,
      [avatarUrl, req.user.id]
    );

    res.json({
      message: 'Profile photo uploaded successfully!',
      avatarUrl,
      user: updated.rows[0],
    });
  } catch (error) {
    console.error('Upload avatar error:', error);
    res.status(500).json({ error: 'Failed to upload profile photo.' });
  }
};

module.exports = {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  getMe,
  updateProfile,
  uploadAvatar,
  uploadAvatarMiddleware,
};
