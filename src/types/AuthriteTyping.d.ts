import { Request as ExpressRequest } from 'express';

export interface AuthenticatedRequest extends ExpressRequest {
  auth?: { identityKey: string 
           certificates: Array
  };
}
