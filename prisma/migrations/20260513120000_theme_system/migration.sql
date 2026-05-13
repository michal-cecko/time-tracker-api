-- Adds 'system' to the Theme enum so clients can defer to OS preference.
ALTER TYPE "Theme" ADD VALUE IF NOT EXISTS 'system';
