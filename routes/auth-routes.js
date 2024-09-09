const express = require('express');
const router = express.Router();
const admin = require("firebase-admin");
const { Timestamp } = require("firebase-admin/firestore");
const { body, validationResult } = require('express-validator');



router.post('/register', [
    body('firstName').notEmpty().withMessage('First name is required'),
    body('lastName').notEmpty().withMessage('Last name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { firstName, lastName, email, password } = req.body;

    try {
        const user = await admin.auth().createUser({
            email,
            password,
            displayName: `${firstName} ${lastName}`
        });

        const uid = user.uid;
        const userDoc = admin.firestore().collection('users').doc(uid);

        const batch = admin.firestore().batch();

        batch.set(userDoc, {
            name: user.displayName,
            email,
            id: uid,
            createdAt: Timestamp.now()
        });

        const taskTitles = ["TODO", "IN PROGRESS", "DONE"];
        taskTitles.forEach(title => {
            const taskListDoc = admin.firestore().collection('taskList').doc();
            const taskDoc = taskListDoc.collection('tasks').doc();

            batch.set(taskListDoc, {
                tasks: [taskDoc.id],
                title: title,
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
                userId: uid,
            });

            batch.set(taskDoc, {
                title,
                description: '', // Assuming description is empty or you can set a default value
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
                order: 0,
                userId: uid,
                id: taskDoc.id,
            });
        });

        await batch.commit();

        return res.status(200).json({
            message: "User created successfully",
        });

    } catch (error) {
        console.error('Error creating user:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

router.post('/login', [
    body('verifyToken').notEmpty().withMessage('Token is required'),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { verifyToken } = req.body;
    try {
        const user = await admin.auth().verifyIdToken(verifyToken);
        return res.status(200).json({
            message: "User logged in successfully",
            user
        });
    } catch (error) {
        console.error('Error logging in user:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

router.post('/google-login', [
    body('idToken').notEmpty().withMessage('Token is required'),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { idToken } = req.body;
    try {
        const user = await admin.auth().verifyIdToken(idToken);
        const userRecord = await admin.firestore().collection('users').doc(user?.uid).get();
        if (userRecord.exists) {
            return res.status(200).json({
                message: "User logged in successfully",
                user: userRecord.data()
            });
        }
        const userDoc = admin.firestore().collection('users').doc(user.uid);

        const batch = admin.firestore().batch();

        batch.set(userDoc, {
            name: user.name,
            email: user.email,
            id: user.uid,
            avatar: user.picture,
            createdAt: Timestamp.now()
        });

        const taskTitles = ["TODO", "IN PROGRESS", "DONE"];
        taskTitles.forEach(title => {
            const taskListDoc = admin.firestore().collection('taskList').doc();
            const taskDoc = taskListDoc.collection('tasks').doc();

            batch.set(taskListDoc, {
                tasks: [taskDoc.id],
                title: title,
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
                userId: user.uid,
            });

            batch.set(taskDoc, {
                title:'',
                description: '', // Assuming description is empty or you can set a default value
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
                order: 0,
                userId: user.uid,
                id: taskDoc.id,
            });
        });

        await batch.commit();


        return res.status(200).json({
            message: "User logged in successfully",
            user: {
                name: user.name,
                email: user.email,
                id: user.uid,
                avatar: user.picture
            }
        });
    } catch (error) {
        console.error('Error logging in user:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

module.exports = router;