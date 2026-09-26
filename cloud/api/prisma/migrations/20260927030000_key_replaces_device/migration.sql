-- Re-binding a physical terminal: a key may name the device it replaces. Redeeming it revokes that device in the same
-- transaction and takes over its seat, so a reinstall never costs an extra seat and never leaves two live records.
ALTER TABLE "ActivationKey" ADD COLUMN "replacesDeviceId" TEXT;
