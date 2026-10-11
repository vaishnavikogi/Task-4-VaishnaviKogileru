const express = require('express');
const studyController = require('../controllers/studyController');
const { validateId, validateSessionCreate, validateSessionUpdate } = require('../middleware/validation');

const router = express.Router();

// Mounted at /api/study-sessions in server.js
router.post('/', validateSessionCreate, studyController.createStudySession); //   CREATE   POST   /api/study-sessions
router.get('/', studyController.getStudySessions); //                              READ ALL GET    /api/study-sessions
router.get('/:id', validateId, studyController.getStudySession); //                READ ONE GET    /api/study-sessions/:id
router.put('/:id', validateId, validateSessionUpdate, studyController.updateStudySession); // UPDATE PUT /api/study-sessions/:id
router.delete('/:id', validateId, studyController.deleteStudySession); //          DELETE   DELETE /api/study-sessions/:id

module.exports = router;
