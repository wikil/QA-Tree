import { nanoid as nano } from 'nanoid';

export const newId = (size = 12): string => nano(size);
