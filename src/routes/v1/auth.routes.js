const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { protect } = require('../../middleware/auth.middleware');
const {
  register,
  login,
  logout,
  refreshToken,
  getMe,
  updateProfile,
  changePassword
} = require('../../controllers/auth.controller');

const registerValidation = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('username').isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('fullName').notEmpty().withMessage('Full name is required')
];

const loginValidation = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
];

const updateProfileValidation = [
  body('fullName').optional().isString(),
  body('bio').optional().isString(),
  body('username').optional().isString().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
  // avatar and coverImage can be base64 strings or URLs, no strict validation needed
];

const changePasswordValidation = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
];

router.post('/register', registerValidation, register);
router.post('/login', loginValidation, login);
router.post('/logout', protect, logout);
router.post('/refresh-token', refreshToken);
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfileValidation, updateProfile);
router.put('/change-password', protect, changePasswordValidation, changePassword);

module.exports = router;