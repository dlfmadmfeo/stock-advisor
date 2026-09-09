-- Apply once before deploying the disclosure retry code.
CREATE TABLE `DisclosureNotification` (
    `rceptNo` VARCHAR(191) NOT NULL,
    `ticker` VARCHAR(191) NOT NULL,
    `corpName` VARCHAR(191) NOT NULL,
    `reportName` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,
    `lastAttemptAt` DATETIME(3) NULL,
    INDEX `DisclosureNotification_completedAt_lastAttemptAt_idx`(`completedAt`, `lastAttemptAt`),
    PRIMARY KEY (`rceptNo`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DisclosureDelivery` (
    `rceptNo` VARCHAR(191) NOT NULL,
    `pushTokenId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `DisclosureDelivery_pushTokenId_idx`(`pushTokenId`),
    PRIMARY KEY (`rceptNo`, `pushTokenId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `DisclosureDelivery` ADD CONSTRAINT `DisclosureDelivery_rceptNo_fkey`
    FOREIGN KEY (`rceptNo`) REFERENCES `DisclosureNotification`(`rceptNo`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `DisclosureDelivery` ADD CONSTRAINT `DisclosureDelivery_pushTokenId_fkey`
    FOREIGN KEY (`pushTokenId`) REFERENCES `PushToken`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
