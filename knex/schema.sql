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

-- partner company record (same shape as giving-forward `corporate_info`);
-- already exists in the dev `honnoi` schema, kept here for reference.
-- companySegment -> company_segment.segmentId, companyBusinessType -> company_business_type.business_id,
-- stateId/districtId/subdistrictId -> thailand_state / thailand_district / thailand_sub_district
CREATE TABLE IF NOT EXISTS `partner_info` (
  `id` int NOT NULL AUTO_INCREMENT,
  `partnerNameLocal` varchar(100) DEFAULT '',
  `partnerNameEN` varchar(100) DEFAULT '',
  `memberCreateId` varchar(13) DEFAULT '',
  `companySegment` varchar(100) DEFAULT '',
  `companyType` varchar(100) DEFAULT '',
  `companyBusinessType` varchar(10) DEFAULT '',
  `companyTaxId` varchar(50) DEFAULT '',
  `address1` varchar(255) DEFAULT '',
  `address2` varchar(255) DEFAULT '',
  `moo` varchar(2) DEFAULT '',
  `village` varchar(100) DEFAULT '',
  `subdistrictId` varchar(10) DEFAULT '',
  `subdistrictText` varchar(100) DEFAULT '',
  `districtId` varchar(10) DEFAULT '',
  `districtText` varchar(100) DEFAULT '',
  `stateId` varchar(10) DEFAULT '',
  `stateText` varchar(100) DEFAULT '',
  `countryId` varchar(3) DEFAULT '764',
  `countryCode` varchar(3) DEFAULT 'THA',
  `zipCode` varchar(10) DEFAULT '',
  `latitude` decimal(12,8) DEFAULT '0.00000000',
  `longitude` decimal(12,8) DEFAULT '0.00000000',
  `profileImage` varchar(200) DEFAULT '',
  `partnerStatus` varchar(10) DEFAULT '1' COMMENT '0 = Not Active , 1 = Active , 2 = Terminated',
  `memberRefId` varchar(13) DEFAULT '',
  `refCode` varchar(10) DEFAULT '',
  `fileCorporate` text,
  `imageCorporate` text,
  `createDate` datetime NOT NULL,
  `updateDate` datetime DEFAULT '2000-01-01 00:00:00',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- partner messages: one row per message, fanned out to one recipient row per
-- partner_info so each company has its own read status
CREATE TABLE IF NOT EXISTS `partner_message` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `targetType` VARCHAR(10) NOT NULL COMMENT 'ALL = Broadcast, PARTNER = ระบุรายบุคคล',
  `priority` VARCHAR(10) NOT NULL DEFAULT 'NORMAL' COMMENT 'NORMAL / IMPORTANT / URGENT',
  `title` VARCHAR(255) NOT NULL,
  `body` TEXT NOT NULL,
  `totalRecipient` INT NOT NULL DEFAULT 0,
  `totalRead` INT NOT NULL DEFAULT 0,
  `senderStaffId` VARCHAR(50) NOT NULL COMMENT '-> bo_user.staffId',
  `senderName` VARCHAR(255) NULL,
  `senderRole` VARCHAR(255) NULL,
  `createDate` DATETIME NOT NULL,
  `updateDate` DATETIME NOT NULL,
  `deleteDate` DATETIME NULL,
  KEY `idx_partner_message_list` (`deleteDate`, `createDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `partner_message_file` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `messageId` INT UNSIGNED NOT NULL,
  `fileName` VARCHAR(255) NOT NULL,
  `fileUrl` VARCHAR(500) NOT NULL,
  `mimeType` VARCHAR(100) NULL,
  `fileSize` INT NOT NULL DEFAULT 0,
  `createDate` DATETIME NOT NULL,
  KEY `idx_pmf_messageId` (`messageId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `partner_message_recipient` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `messageId` INT UNSIGNED NOT NULL,
  `partnerInfoId` INT NOT NULL COMMENT '-> partner_info.id',
  `readStatus` TINYINT NOT NULL DEFAULT 0 COMMENT '0 = ยังไม่ได้เปิด, 1 = เปิดดูแล้ว',
  `readDate` DATETIME NULL,
  `readByUserId` VARCHAR(50) NULL COMMENT 'partner_user ที่เปิดคนแรก',
  `createDate` DATETIME NOT NULL,
  UNIQUE KEY `uq_pmr_message_partner` (`messageId`, `partnerInfoId`),
  KEY `idx_pmr_inbox` (`partnerInfoId`, `readStatus`, `createDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- links a partner login to its company (used to scope the message inbox)
-- ALTER TABLE `partner_user` ADD COLUMN `partnerInfoId` INT NULL AFTER `userId`,
--   ADD KEY `idx_partner_user_partnerInfoId` (`partnerInfoId`);
