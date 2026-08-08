const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../../middleware/auth.middleware');
const {
  reportUser,
  getAllReports,
  getMyReports,
  updateReportStatus,
  getReportById,
  getReportStats
} = require('../../controllers/report.controller');

router.post('/', protect, reportUser);
router.get('/my', protect, getMyReports);
router.get('/', protect, restrictTo('ADMIN'), getAllReports);
router.get('/stats', protect, restrictTo('ADMIN'), getReportStats);
router.get('/:id', protect, restrictTo('ADMIN'), getReportById);
router.put('/:id/status', protect, restrictTo('ADMIN'), updateReportStatus);

module.exports = router;