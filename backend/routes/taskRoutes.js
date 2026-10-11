const express = require('express');
const taskController = require('../controllers/taskController');
const { validateId, validateTaskCreate, validateTaskUpdate } = require('../middleware/validation');

const router = express.Router();

// Mounted at /api/tasks in server.js.
// Each route runs its validation middleware first, then the controller.
router.post('/', validateTaskCreate, taskController.createTask); //        CREATE   POST   /api/tasks
router.get('/', taskController.getTasks); //                                READ ALL GET    /api/tasks
router.get('/:id', validateId, taskController.getTask); //                  READ ONE GET    /api/tasks/:id
router.put('/:id', validateId, validateTaskUpdate, taskController.updateTask); // UPDATE PUT /api/tasks/:id
router.delete('/:id', validateId, taskController.deleteTask); //            DELETE   DELETE /api/tasks/:id

module.exports = router;
