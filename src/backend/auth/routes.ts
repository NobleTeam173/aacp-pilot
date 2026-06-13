import { AuthService } from './authService';
import { getBearerToken } from './middleware';

const authService = new AuthService();

export const AuthController = {
  async register(req: any, res: any) {
    try {
      const result = await authService.register(req.body);
      res.status(201).json(result);
    } catch (error: unknown) {
      res.status(400).json({ error: (error as Error).message });
    }
  },

  async login(req: any, res: any) {
    try {
      const { email, password, otp } = req.body;
      const result = await authService.login(email, password, otp);
      if (result.mfaRequired) {
        return res.status(202).json(result);
      }

      res.status(200).json(result);
    } catch (error: unknown) {
      res.status(401).json({ error: (error as Error).message });
    }
  },

  async logout(req: any, res: any) {
    try {
      const refreshToken = req.body?.refresh_token || getBearerToken(req.headers);
      if (!refreshToken) {
        res.status(400).json({ error: 'Missing refresh token' });
        return;
      }

      const revoked = await authService.logout(refreshToken);
      if (!revoked) {
        res.status(400).json({ error: 'Unable to revoke refresh token' });
        return;
      }

      res.status(200).json({ message: 'Logged out successfully' });
    } catch (error: unknown) {
      res.status(400).json({ error: (error as Error).message });
    }
  },

  async refresh(req: any, res: any) {
    try {
      const refreshToken = req.body?.refresh_token;
      if (!refreshToken) {
        res.status(400).json({ error: 'Missing refresh token' });
        return;
      }

      const result = await authService.refresh(refreshToken);
      res.status(200).json(result);
    } catch (error: unknown) {
      res.status(401).json({ error: (error as Error).message });
    }
  },

  async initiateMfaSetup(req: any, res: any) {
    try {
      const { email, password } = req.body;
      const result = await authService.initiateMfaSetup(email, password);
      res.status(200).json({ secret: result.secret, message: 'MFA setup initiated' });
    } catch (error: unknown) {
      res.status(400).json({ error: (error as Error).message });
    }
  },

  async confirmMfa(req: any, res: any) {
    try {
      const { email, password, token } = req.body;
      const confirmed = await authService.confirmMfaSetup(email, password, token);
      if (!confirmed) {
        res.status(400).json({ error: 'Invalid MFA token or setup not initiated' });
        return;
      }

      res.status(200).json({ success: true, message: 'MFA confirmed' });
    } catch (error: unknown) {
      res.status(400).json({ error: (error as Error).message });
    }
  },

  async disableMfa(req: any, res: any) {
    try {
      const { email, password, otp } = req.body;
      const disabled = await authService.disableMfa(email, password, otp);
      if (!disabled) {
        res.status(400).json({ error: 'Unable to disable MFA' });
        return;
      }

      res.status(200).json({ success: true, message: 'MFA disabled' });
    } catch (error: unknown) {
      res.status(400).json({ error: (error as Error).message });
    }
  },
};
