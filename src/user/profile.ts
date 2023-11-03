// Referenced @mingminggl’s TypeScript translation from P1: https://github.com/CMU-313/NodeBB/pull/210

import _ = require("lodash");
// I was unable to resolve the issue import/no-import-module-exports
// Tried removing moduel.export which resulted in code not passing tests
// Tried changing to import format above which resulted in Property 'isURL' does not exist error
// eslint-disable-next-line import/no-import-module-exports
import validator from "validator";
import winston = require("winston");

import utils = require("../utils");
import slugify = require("../slugify");
import meta = require("../meta");
import db = require("../database");
import groups = require("../groups");
import plugins = require("../plugins");

interface UserUpdateData {
  uid: number;
  username?: string;
  email?: string;
  fullname: string;
  website?: string;
  location?: string;
  groupTitle?: string;
  birthday?: string;
  signature?: string;
  aboutme?: string;
}

interface UserChangePasswordData {
  uid: number;
  currentPassword?: string;
  newPassword: string;
  ip: string;
  email: string;
}

export interface UserModel {
  updateProfile: (
    uid: number,
    data: UserUpdateData,
    extraFields: string[],
  ) => Promise<unknown>;
  hashPassword(newPassword: string): unknown;
  isPasswordCorrect(uid: number, currentPassword: string, ip: string): unknown;
  hasPassword(uid: number): boolean;
  isAdministrator(uid: number): boolean;
  isPasswordValid(newPassword: string): unknown;
  setUserField(uid: number, field: string, value: string): unknown;
  getUserField(uid: number, arg1: string): unknown;
  checkUsername: (data: UserUpdateData, uid: number) => Promise<void>;
  existsBySlug(userslug: string): unknown;
  setUserFields(updateUid: number, updateData: unknown);
  getUserFields(updateUid: number, fields: string[]): unknown;
  checkMinReputation: (
    callerUid: number,
    uid: number,
    setting: string,
  ) => Promise<void>;
  changePassword: (uid: number, data: UserChangePasswordData) => Promise<void>;
  reset: ResetModule;
  auth: AuthModule;
  email: EmailModule;
}

// Define a type for the Reset module
interface ResetModule {
  cleanByUid(uid: number): Promise<void>;
  updateExpiry(uid: number): Promise<void>;
}

// Define a type for the Auth module
interface AuthModule {
  revokeAllSessions(uid: number): Promise<void>;
}

// Define a type for the Email module
interface EmailModule {
  expireValidation(uid: number): Promise<void>;
  sendValidationEmail(
    uid: number,
    options: SendValidationEmailOptions,
  ): Promise<void>;
}

// Define a type for the options parameter of sendValidationEmail
interface SendValidationEmailOptions {
  email: string;
  force: number;
}

module.exports = function (User: UserModel) {
  async function isUsernameAvailable(data: UserUpdateData, uid: number) {
    if (!data.username) {
      return;
    }
    data.username = data.username?.trim();

    let userData: { username: string; userslug: string };
    if (uid) {
      userData = (await User.getUserFields(uid, ["username", "userslug"])) as {
        username: string;
        userslug: string;
      };
      if (userData.username === data.username) {
        return;
      }
    }
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    if (data.username.length < meta.config.minimumUsernameLength) {
      throw new Error("[[error:username-too-short]]");
    }
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    if (data.username.length > meta.config.maximumUsernameLength) {
      throw new Error("[[error:username-too-long]]");
    }

    const userslug: string = slugify(data.username) as string;
    if (!utils.isUserNameValid(data.username) || !userslug) {
      throw new Error("[[error:invalid-username]]");
    }

    if (uid && userslug === userData.userslug) {
      return;
    }
    const exists = await User.existsBySlug(userslug);
    if (exists) {
      throw new Error("[[error:username-taken]]");
    }

    const { error }: { error: undefined } = (await plugins.hooks.fire(
      "filter:username.check",
      {
        username: data.username,
        error: undefined,
      },
    )) as { error: undefined };
    if (error) {
      throw error;
    }
  }
  User.checkUsername = async (username: UserUpdateData, uid: number) =>
    isUsernameAvailable(username, uid);

  async function isWebsiteValid(callerUid: number, data: UserUpdateData) {
    if (!data.website) {
      return;
    }
    if (data.website.length > 255) {
      throw new Error("[[error:invalid-website]]");
    }
    await User.checkMinReputation(callerUid, data.uid, "min:rep:website");
  }

  async function isAboutMeValid(callerUid: number, data: UserUpdateData) {
    if (!data.aboutme) {
      return;
    }
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    if (
      data.aboutme !== undefined &&
      data.aboutme.length > meta.config.maximumAboutMeLength
    ) {
      // The next line calls a function in a module that has not been updated to TS yet
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      throw new Error(
        `[[error:about-me-too-long, ${String(
          meta.config.maximumAboutMeLength,
        )}]]`,
      );
    }

    await User.checkMinReputation(callerUid, data.uid, "min:rep:aboutme");
  }

  async function isSignatureValid(callerUid: number, data: UserUpdateData) {
    if (!data.signature) {
      return;
    }
    const signature = data.signature.replace(/\r\n/g, "\n");
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    if (signature.length > meta.config.maximumSignatureLength) {
      // The next line calls a function in a module that has not been updated to TS yet
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      throw new Error(
        `[[error:signature-too-long, ${String(
          meta.config.maximumSignatureLength,
        )}]]`,
      );
    }
    await User.checkMinReputation(callerUid, data.uid, "min:rep:signature");
  }

  function isFullnameValid(data: UserUpdateData) {
    if (
      data.fullname &&
      (validator.isURL(data.fullname) || data.fullname.length > 255)
    ) {
      throw new Error("[[error:invalid-fullname]]");
    }
  }

  function isLocationValid(data: UserUpdateData) {
    if (
      data.location &&
      (validator.isURL(data.location) || data.location.length > 255)
    ) {
      throw new Error("[[error:invalid-location]]");
    }
  }

  function isBirthdayValid(data: UserUpdateData) {
    if (!data.birthday) {
      return;
    }

    const result = new Date(data.birthday);
    if (result && result.toString() === "Invalid Date") {
      throw new Error("[[error:invalid-birthday]]");
    }
  }

  function isGroupTitleValid(data: UserUpdateData) {
    function checkTitle(title: string) {
      if (title === "registered-users" || groups.isPrivilegeGroup(title)) {
        throw new Error("[[error:invalid-group-title]]");
      }
    }
    if (!data.groupTitle) {
      return;
    }
    let groupTitles: string[] = [];
    if (validator.isJSON(data.groupTitle)) {
      groupTitles = JSON.parse(data.groupTitle) as string[];
      if (!Array.isArray(groupTitles)) {
        throw new Error("[[error:invalid-group-title]]");
      }
      groupTitles.forEach((title) => checkTitle(title));
    } else {
      groupTitles = [data.groupTitle];
      checkTitle(data.groupTitle);
    }
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    if (!meta.config.allowMultipleBadges && groupTitles.length > 1) {
      data.groupTitle = JSON.stringify(groupTitles[0]);
    }
  }

  function isEmailValid(data: UserUpdateData) {
    if (!data.email) {
      return;
    }

    data.email = data.email.trim();
    if (!utils.isEmailValid(data.email)) {
      throw new Error("[[error:invalid-email]]");
    }
  }

  async function validateData(callerUid: number, data: UserUpdateData) {
    isEmailValid(data);
    await isUsernameAvailable(data, data.uid);
    await isWebsiteValid(callerUid, data);
    await isAboutMeValid(callerUid, data);
    await isSignatureValid(callerUid, data);
    isFullnameValid(data);
    isLocationValid(data);
    isBirthdayValid(data);
    isGroupTitleValid(data);
  }

  User.checkMinReputation = async function (
    callerUid: number,
    uid: number,
    setting,
  ) {
    const roundedNumber1: number = Math.round(uid * 10) / 10;
    const roundedNumber2: number = Math.round(callerUid * 10) / 10;
    const isSelf = roundedNumber1 === roundedNumber2;
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    if (!isSelf || meta.config["reputation:disabled"]) {
      return;
    }
    const reputation = await User.getUserField(uid, "reputation");
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    if (reputation < meta.config[setting]) {
      // The next line calls a function in a module that has not been updated to TS yet
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      throw new Error(
        `[[error:not-enough-reputation-${setting.replace(/:/g, "-")}, ${String(
          meta.config[setting],
        )}]]`,
      );
    }
  };

  async function updateEmail(uid: number, newEmail: string) {
    let oldEmail = await User.getUserField(uid, "email");
    oldEmail = oldEmail || "";
    if (oldEmail === newEmail) {
      return;
    }

    // 👉 Looking for email change logic? src/user/email.js (UserEmail.confirmByUid)
    if (newEmail) {
      // The next line calls a function in a module that has not been updated to TS yet
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      await User.email
        .sendValidationEmail(uid, {
          email: newEmail,
          force: 1,
          // The next line calls a function in a module that has not been updated to TS yet
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        })
        .catch((err) =>
          winston.error(
            `[user.create] Validation email failed to send\n[emailer.send] ${String(
              err.stack,
            )}`,
          ),
        );
    }
  }

  async function updateUidMapping(
    field: string,
    uid: number,
    value: string,
    oldValue: string,
  ) {
    if (value === oldValue) {
      return;
    }
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    await db.sortedSetRemove(`${field}:uid`, oldValue);
    await User.setUserField(uid, field, value);
    if (value) {
      // The next line calls a function in a module that has not been updated to TS yet
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      await db.sortedSetAdd(`${field}:uid`, uid, value);
    }
  }

  async function updateUsername(uid: number, newUsername: string) {
    if (!newUsername) {
      return;
    }
    const userData = ((await User.getUserFields(uid, [
      "username",
      "userslug",
    ])) as { username: string; userslug: string }) || {
      username: "",
      userslug: "",
    };

    if (userData.username === newUsername) {
      return;
    }

    const newUserslug: string = slugify(newUsername) as string;
    const now = Date.now();
    await Promise.all([
      updateUidMapping("username", uid, newUsername, userData.username),
      updateUidMapping("userslug", uid, newUserslug, userData.userslug),
      // The next line calls a function in a module that has not been updated to TS yet
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      db.sortedSetAdd(`user:${uid}:usernames`, now, `${newUsername}:${now}`),
    ]);
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    await db.sortedSetRemove(
      "username:sorted",
      `${userData.username.toLowerCase()}:${uid}`,
    );
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    await db.sortedSetAdd(
      "username:sorted",
      0,
      `${newUsername.toLowerCase()}:${uid}`,
    );
  }

  async function updateFullname(uid: number, newFullname: string) {
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    const fullname = (await User.getUserField(uid, "fullname")) as string;
    await updateUidMapping("fullname", uid, newFullname, fullname);
    if (newFullname !== fullname) {
      if (fullname) {
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        await db.sortedSetRemove(
          "fullname:sorted",
          `${fullname.toLowerCase()}:${uid}`,
        );
      }
      if (newFullname) {
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        await db.sortedSetAdd(
          "fullname:sorted",
          0,
          `${newFullname.toLowerCase()}:${uid}`,
        );
      }
    }
  }

  User.updateProfile = async function (
    uid: number,
    data: UserUpdateData,
    extraFields,
  ) {
    let fields: string[] = [
      "username",
      "email",
      "fullname",
      "website",
      "location",
      "groupTitle",
      "birthday",
      "signature",
      "aboutme",
    ] as string[];
    if (Array.isArray(extraFields)) {
      fields = _.uniq(fields.concat(extraFields));
    }
    if (!data.uid) {
      throw new Error("[[error:invalid-update-uid]]");
    }
    const updateUid = data.uid;
    const result: { uid: number; data: UserUpdateData; fields: string[] } =
      (await plugins.hooks.fire("filter:user.updateProfile", {
        uid: uid,
        data: data,
        fields: fields,
      })) as { uid: number; data: UserUpdateData; fields: string[] };
    fields = result.fields;
    data = result.data;
    await validateData(uid, data);
    const oldData = await User.getUserFields(updateUid, fields);
    const updateData = {};
    await Promise.all(
      fields.map(async (field) => {
        if (!(data[field] !== undefined && typeof data[field] === "string")) {
          return;
        }
        data[field] = (data[field] as string).trim();
        if (field === "email") {
          return await updateEmail(updateUid, data.email);
        } else if (field === "username") {
          return await updateUsername(updateUid, data.username);
        } else if (field === "fullname") {
          return await updateFullname(updateUid, data.fullname);
        }
        updateData[field] = data[field] as UserUpdateData;
      }),
    );
    if (Object.keys(updateData).length) {
      await User.setUserFields(updateUid, updateData);
    }
    const hookResult = plugins.hooks.fire("action:password.change", {
      uid: uid,
      data: data,
      fields: fields,
      oldData: oldData,
    });
    // Check if it's a promise and wait for it if needed
    if (hookResult instanceof Promise) {
      await hookResult;
    }
    return await User.getUserFields(updateUid, [
      "email",
      "username",
      "userslug",
      "picture",
      "icon:text",
      "icon:bgColor",
    ]);
  };

  User.changePassword = async function (
    uid: number,
    data: UserChangePasswordData,
  ) {
    try {
      if (uid <= 0 || !data || !data.uid) {
        throw new Error("[[error:invalid-uid]]");
      }
      User.isPasswordValid(data.newPassword);
      const [isAdmin, hasPassword]: boolean[] = await Promise.all([
        User.isAdministrator(uid),
        User.hasPassword(uid),
      ] as boolean[]);
      // The next line calls a function in a module that has not been updated to TS yet
      /* eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,
                @typescript-eslint/no-unsafe-call */
      if (meta.config["password:disableEdit"] && !isAdmin) {
        throw new Error("[[error:no-privileges]]");
      }
      const roundedNumber1: number = Math.round(uid * 10) / 10;
      const roundedNumber2: number = Math.round(data.uid * 10) / 10;
      const isSelf = roundedNumber1 === roundedNumber2;
      if (!isAdmin && !isSelf) {
        throw new Error("[[user:change_password_error_privileges]]");
      }
      if (isSelf && hasPassword) {
        const correct = await User.isPasswordCorrect(
          data.uid,
          data.currentPassword,
          data.ip,
        );
        if (!correct) {
          throw new Error("[[user:change_password_error_wrong_current]]");
        }
      }
      const hashedPassword = await User.hashPassword(data.newPassword);
      await Promise.all([
        User.setUserFields(data.uid, {
          password: hashedPassword,
          "password:shaWrapped": 1,
          // The next line calls a function in a module that has not been updated to TS yet
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          rss_token: utils.generateUUID() as number,
        }),
        // The next line calls a function in a module that has not been updated to TS yet
        /* eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,
                @typescript-eslint/no-unsafe-call */
        User.reset.cleanByUid(data.uid),
        // The next line calls a function in a module that has not been updated to TS yet
        /* eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,
                @typescript-eslint/no-unsafe-call */
        User.reset.updateExpiry(data.uid),
        // The next line calls a function in a module that has not been updated to TS yet
        /* eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,
                @typescript-eslint/no-unsafe-call */
        User.auth.revokeAllSessions(data.uid),
        // The next line calls a function in a module that has not been updated to TS yet
        /* eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,
                @typescript-eslint/no-unsafe-call */
        User.email.expireValidation(data.uid),
      ]);
      // Handle plugins.hooks.fire separately if it's not a promise
      const hookResult = plugins.hooks.fire("action:password.change", {
        uid: uid,
        targetUid: data.uid,
      });
      // Check if it's a promise and wait for it if needed
      if (hookResult instanceof Promise) {
        await hookResult;
      }
    } catch (error) {
      // Handle errors here, e.g., log the error or perform some other action.
      console.error(error);
      throw error; // Rethrow the error if needed
    }
  };
};
