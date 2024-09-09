const express = require('express');
const router = express.Router();
const admin = require("firebase-admin");
const { Timestamp } = require("firebase-admin/firestore");
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/authorization'); // Import correctly

router.post('/addTask',
    authenticateToken,
    [
        body('title').optional().trim().escape(),
        body('description').optional().trim().escape(),
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        const token = req.headers.authorization.split(' ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);
        const uid = decodedToken.uid;



        const { title = '', description = '' } = req.body;

        try {
            const task = {
                title,
                description,
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
                order: 0,
                userId: uid,
            };

            const docRef = await admin.firestore().collection('taskList').add({
                tasks: [],
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
                userId: uid,
            });

            const doc = await admin.firestore().collection(`taskList/${docRef.id}/tasks`).add(task);
            await admin.firestore().collection(`taskList/${docRef.id}/tasks`).doc(doc.id).update({
                id: doc.id,
            });

            await admin.firestore().collection('taskList').doc(docRef.id).update({
                tasks: admin.firestore.FieldValue.arrayUnion(doc.id),
            });

            return res.status(201).json({ message: 'Task added successfully', taskId: doc.id });

        } catch (error) {
            console.error('Error adding task:', error);
            return res.status(500).json({ error: 'Something went wrong' });
        }
    }
);

router.get('/', authenticateToken, async (req, res) => {
    try {
        const token = req.headers.authorization.split(' ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);
        const uid = decodedToken.uid;
        const snapshot = await admin.firestore().collection('taskList').get();
        const tasks = [];

        for (const doc of snapshot.docs) {
            if (doc.data().userId === uid) {
                const taskList = await admin.firestore().collection(`taskList/${doc.id}/tasks`).get();

                taskList.forEach((task) => {
                    tasks.push({
                        id: task.id,
                        listId: doc.id,
                        ...task.data(),
                    });
                });
            }
        }

        return res.status(200).json(tasks);

    } catch (error) {
        console.error('Error getting tasks:', error);
        return res.status(500).json({ error: 'Something went wrong' });
    }
});

router.put('/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { title, description, listId } = req.body;

    try {
        await admin.firestore().collection(`taskList/${listId}/tasks`).doc(id).update({
            title,
            description,
            updatedAt: Timestamp.now(),
        });

        return res.status(200).json({ message: 'Task updated successfully' });

    } catch (error) {
        console.error('Error updating task:', error);
        return res.status(500).json({ error: 'Something went wrong' });
    }
});

router.put('/reorder', authenticateToken, async (req, res) => {
    const { listId, newList, id, order, title, description } = req.body;

    try {
        const db = admin.firestore();

        // If task is moving to a new list, delete it from the old list
        if (newList && listId !== newList) {
            await db.collection(`taskList/${listId}/tasks`).doc(id).delete();
        }

        // Get tasks in the new list (or current list) that have an order greater than or equal to the new order
        const tasksToUpdate = await db.collection(`taskList/${newList || listId}/tasks`)
            .where('order', '>=', order)
            .orderBy('order', 'asc')
            .get();

        const batch = db.batch();

        // Increment the order of all tasks that come after the newly placed task
        tasksToUpdate.forEach((doc) => {
            const taskRef = db.collection(`taskList/${newList || listId}/tasks`).doc(doc.id);
            batch.update(taskRef, { order: doc.data().order + 1 });
        });

        // Add the task to the new list (or update its position in the current list)
        const taskRef = db.collection(`taskList/${newList || listId}/tasks`).doc(id);
        batch.set(taskRef, {
            id,
            title,
            description,
            order, // New order position
        });

        // Commit the batch operation
        await batch.commit();

        return res.status(200).json({ message: 'Task reordered successfully' });

    } catch (error) {
        console.error('Error reordering task:', error);
        return res.status(500).json({ error: 'Something went wrong' });
    }
});

router.delete('/', authenticateToken, async (req, res) => {
    const { listId, id } = req.query;

    try {
        await admin.firestore().collection(`taskList/${listId}/tasks`).doc(id).delete();
        const taskListSnapshot = await admin.firestore().collection('taskList/${listId}/tasks').get()

        if (taskListSnapshot.docs.length === 0) {
            await admin.firestore().collection('taskList').doc(listId).delete();
        } else {
            await admin.firestore().collection('taskList').doc(listId).update({
                tasks: admin.firestore.FieldValue.arrayRemove(id),
            });
        }

        return res.status(200).json({ message: 'Task deleted successfully' });

    } catch (error) {
        console.error('Error deleting task:', error);
        return res.status(500).json({ error: 'Something went wrong' });
    }
});

module.exports = router;