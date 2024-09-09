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
            const taskListSnapshot = await admin.firestore().collection('taskList')
                .where('userId', '==', uid)
                .where('title', '==', 'TODO')
                .limit(1)
                .get();

            let taskListRef;
            if (taskListSnapshot.empty) {
                // If no "TODO" list is found, create a new one
                taskListRef = admin.firestore().collection('taskList').doc();
                await taskListRef.set({
                    title: 'TODO',
                    tasks: [],
                    createdAt: Timestamp.now(),
                    updatedAt: Timestamp.now(),
                    userId: uid,
                });
            } else {
                taskListRef = taskListSnapshot.docs[0].ref;
            }
            const existingTasksSnapshot = await taskListRef.collection('tasks').get();
            const order = existingTasksSnapshot.size;

            const batch = admin.firestore().batch();
            const taskRef = taskListRef.collection('tasks').doc();

            const task = {
                title,
                description,
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
                order: order,
                userId: uid,
                id: taskRef.id,
            };

            batch.set(taskRef, task);
            batch.update(taskListRef, {
                tasks: admin.firestore.FieldValue.arrayUnion(taskRef.id),
                updatedAt: Timestamp.now(),
            });

            await batch.commit();
            return res.status(201).json({ message: 'Task added successfully', taskId: taskRef.id });

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

        // Fetch task lists where userId equals the authenticated user's ID
        const snapshot = await admin.firestore().collection('taskList')
            .where('userId', '==', uid)
            .get();

        // Initialize tasks array with placeholders for TODO, IN PROGRESS, and DONE
        const tasks = [
            { id: null, title: 'TODO', tasks: [] },
            { id: null, title: 'IN PROGRESS', tasks: [] },
            { id: null, title: 'DONE', tasks: [] }
        ];

        for (const doc of snapshot.docs) {
            const taskListSnapshot = await admin.firestore().collection(`taskList/${doc.id}/tasks`).orderBy(
                'order', 'asc'
            ).get();
            const taskList = taskListSnapshot.docs.map(taskDoc => ({
                ...taskDoc.data(),
                listId: doc.id
            }));

            switch (doc.data().title.toUpperCase()) {
                case 'TODO':
                    tasks[0] = {
                        id: doc.id,
                        title: doc.data().title,
                        tasks: taskList,
                    };
                    break;
                case 'IN PROGRESS':
                    tasks[1] = {
                        id: doc.id,
                        title: doc.data().title,
                        tasks: taskList,
                    };
                    break;
                case 'DONE':
                    tasks[2] = {
                        id: doc.id,
                        title: doc.data().title,
                        tasks: taskList,
                    };
                    break;
                default:
                    console.warn(`Unexpected list title: ${doc.data().title}`);
                    break;
            }
        }

        return res.status(200).json(tasks);

    } catch (error) {
        console.error('Error getting tasks:', error);
        return res.status(500).json({ error: 'Something went wrong' });
    }
});

router.put('/:id',
    authenticateToken,
    body('title').optional().trim().escape(),
    body('description').optional().trim().escape(),
    body('listId').optional().trim().escape(),
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
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

router.post('/reorder', authenticateToken,
    body('listId').optional().trim().escape(),
    body('newList').optional().trim().escape(),
    body('id').optional().trim().escape(),
    body('order').optional().isNumeric()
    , async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { listId, newList, id, order } = req.body;

        try {
            const batch = admin.firestore().batch();

            let taskData;

            if (newList && listId !== newList) {
                const oldTaskRef = admin.firestore().collection(`taskList/${listId}/tasks`).doc(id);
                await admin.firestore().collection('taskList').doc(listId).update({
                    tasks: admin.firestore.FieldValue.arrayRemove(id),
                });
                const oldTaskDoc = await oldTaskRef.get();
                if (!oldTaskDoc.exists) {
                    return res.status(404).json({ error: 'Task not found' });
                }
                taskData = oldTaskDoc.data();
                batch.delete(oldTaskRef);
            } else {
                const taskRef = admin.firestore().collection(`taskList/${listId}/tasks`).doc(id);
                const taskDoc = await taskRef.get();
                if (!taskDoc.exists) {
                    return res.status(404).json({ error: 'Task not found' });
                }
                taskData = taskDoc.data();
            }

            const tasksToUpdateSnapshot = await admin.firestore().collection(`taskList/${newList || listId}/tasks`)
                .where('order', '>=', order)
                .orderBy('order', 'asc')
                .get();

            tasksToUpdateSnapshot.forEach((doc) => {
                const taskRef = admin.firestore().collection(`taskList/${newList || listId}/tasks`).doc(doc.id);
                batch.update(taskRef, { order: doc.data().order + 1 });
            });

            const taskRef = admin.firestore().collection(`taskList/${newList || listId}/tasks`).doc(id);
            batch.set(taskRef, {
                ...taskData,
                order,
                updatedAt: Timestamp.now(),
            });

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

        await admin.firestore().collection('taskList').doc(listId).update({
            tasks: admin.firestore.FieldValue.arrayRemove(id),
        });

        return res.status(200).json({ message: 'Task deleted successfully' });

    } catch (error) {
        console.error('Error deleting task:', error);
        return res.status(500).json({ error: 'Something went wrong' });
    }
});

module.exports = router;