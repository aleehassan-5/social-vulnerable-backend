const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../../middleware/auth.middleware');
const {
  getAllUsers,
  getUserById,
  updateUserRole,
  deactivateUser,
  reactivateUser,
  deleteUser,
  getDashboardStats
} = require('../../controllers/admin.controller');

// All admin routes are protected and require ADMIN role
router.use(protect, restrictTo('ADMIN'));

router.get('/dashboard', getDashboardStats);
router.get('/users', getAllUsers);
router.get('/users/:id', getUserById);
router.put('/users/:id/role', updateUserRole);
router.put('/users/:id/deactivate', deactivateUser);
router.put('/users/:id/reactivate', reactivateUser);
router.delete('/users/:id', deleteUser);

module.exports = router;