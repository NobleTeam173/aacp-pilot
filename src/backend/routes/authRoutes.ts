import express from 'express';
import { AuthController } from '../auth/routes';

export const authRouter = express.Router();

authRouter.post('/register', AuthController.register);
authRouter.post('/login', AuthController.login);
authRouter.post('/logout', AuthController.logout);
authRouter.post('/refresh', AuthController.refresh);
authRouter.post('/mfa/setup', AuthController.initiateMfaSetup);
authRouter.post('/mfa/confirm', AuthController.confirmMfa);
authRouter.post('/mfa/disable', AuthController.disableMfa);
