-- honnoi-partner-web-backoffice
-- New tables for the shared `honnoi` MySQL database.
-- No migration tool is used in this codebase (matches honnoi-account / honnoi-web-backoffice) —
-- run this manually against the `honnoi` schema before starting the API.

CREATE TABLE IF NOT EXISTS `partner_user` (
  `userId` VARCHAR(50) NOT NULL PRIMARY KEY,
  `name` VARCHAR(255) NULL,
  `lastname` VARCHAR(255) NULL,
  `mobile` VARCHAR(50) NULL,
  `userName` VARCHAR(255) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `email` VARCHAR(100) NULL,
  `google_id` VARCHAR(100) NULL,
  `userGroup` VARCHAR(10) NULL,
  `userLevel` VARCHAR(10) NULL,
  `userClass` VARCHAR(10) NULL,
  `loginErrCount` INT NOT NULL DEFAULT 0,
  `loginBlock` VARCHAR(10) NOT NULL DEFAULT '0',
  `userStatus` VARCHAR(10) NOT NULL DEFAULT '1',
  `firstLogin` DATETIME NULL,
  `lastLogin` DATETIME NULL,
  `changePassword` VARCHAR(10) NOT NULL DEFAULT '0',
  `companyName` VARCHAR(255) NULL,
  `department` VARCHAR(255) NULL,
  `profileImgUrl` VARCHAR(500) NULL,
  `authenToken` VARCHAR(500) NULL,
  `createDate` DATETIME NOT NULL,
  `updateDate` DATETIME NOT NULL,
  `deleteUserDate` DATETIME NULL,
  UNIQUE KEY `uq_partner_user_userName` (`userName`),
  UNIQUE KEY `uq_partner_user_email` (`email`),
  UNIQUE KEY `uq_partner_user_google_id` (`google_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- tracks which methods are enrolled/enabled per partner; the Google Authenticator
-- secret itself lives on `partner_user.authenToken`, not here.
CREATE TABLE IF NOT EXISTS `partner_2fa_method` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `userId` VARCHAR(50) NOT NULL,
  `method` ENUM('EMAIL','SMS','TOTP') NOT NULL,
  `target` VARCHAR(255) NULL,
  `enabled` TINYINT NOT NULL DEFAULT 0,
  `createDate` DATETIME NOT NULL,
  `updateDate` DATETIME NOT NULL,
  UNIQUE KEY `uq_partner_2fa_user_method` (`userId`, `method`),
  KEY `idx_partner_2fa_userId` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- `otp_verify` is the SHARED otp table (honnoi-account already writes rows into it for
-- USER/BO flows without a `type`/`status`/`cancelDate` column). This app reuses the same
-- table with `type='PARTNER'`, matched by email/mobile rather than a userId column.
--
-- Fresh database (table does not exist yet):
CREATE TABLE IF NOT EXISTS `otp_verify` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `refCode` VARCHAR(20) NULL,
  `status` VARCHAR(10) NOT NULL DEFAULT '0',
  `createDate` DATETIME NOT NULL,
  `updateDate` DATETIME NOT NULL,
  `cancelDate` DATETIME NULL,
  `otp` VARCHAR(10) NULL,
  `email` VARCHAR(100) NULL,
  `mobile` VARCHAR(50) NULL,
  `type` ENUM('BO','PARTNER','USER') NULL,
  KEY `idx_otp_verify_email_type` (`email`, `type`, `createDate`),
  KEY `idx_otp_verify_mobile_type` (`mobile`, `type`, `createDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table already exists (it does, from honnoi-account) — add only the missing columns:
-- ALTER TABLE `otp_verify`
--   ADD COLUMN `status` VARCHAR(10) NOT NULL DEFAULT '0' AFTER `refCode`,
--   ADD COLUMN `cancelDate` DATETIME NULL AFTER `updateDate`,
--   ADD COLUMN `type` ENUM('BO','PARTNER','USER') NULL AFTER `cancelDate`,
--   ADD KEY `idx_otp_verify_email_type` (`email`, `type`, `createDate`),
--   ADD KEY `idx_otp_verify_mobile_type` (`mobile`, `type`, `createDate`);

CREATE TABLE IF NOT EXISTS `partner_login_log` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `logInId` VARCHAR(50) NOT NULL,
  `userId` VARCHAR(50) NULL,
  `userName` VARCHAR(255) NULL,
  `mobileNo` VARCHAR(50) NULL,
  `result` VARCHAR(20) NULL,
  `channel` VARCHAR(20) NULL,
  `createDate` DATETIME NOT NULL,
  KEY `idx_partner_login_log_userId` (`userId`),
  KEY `idx_partner_login_log_createDate` (`createDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
