"use strict";
// Referenced @mingminggl’s TypeScript translation from P1: https://github.com/CMU-313/NodeBB/pull/210
var __awaiter =
    (this && this.__awaiter) ||
    function (thisArg, _arguments, P, generator) {
        function adopt(value) {
            return value instanceof P
                ? value
                : new P(function (resolve) {
                      resolve(value);
                  });
        }
        return new (P || (P = Promise))(function (resolve, reject) {
            function fulfilled(value) {
                try {
                    step(generator.next(value));
                } catch (e) {
                    reject(e);
                }
            }
            function rejected(value) {
                try {
                    step(generator["throw"](value));
                } catch (e) {
                    reject(e);
                }
            }
            function step(result) {
                result.done
                    ? resolve(result.value)
                    : adopt(result.value).then(fulfilled, rejected);
            }
            step(
                (generator = generator.apply(thisArg, _arguments || [])).next(),
            );
        });
    };
var __importDefault =
    (this && this.__importDefault) ||
    function (mod) {
        return mod && mod.__esModule ? mod : { default: mod };
    };
Object.defineProperty(exports, "__esModule", { value: true });
const _ = require("lodash");
// I was unable to resolve the issue import/no-import-module-exports
// Tried removing moduel.export which resulted in code not passing tests
// Tried changing to import format above which resulted in Property 'isURL' does not exist error
// eslint-disable-next-line import/no-import-module-exports
const validator_1 = __importDefault(require("validator"));
const winston = require("winston");
const utils = require("../utils");
const slugify = require("../slugify");
const meta = require("../meta");
const db = require("../database");
const groups = require("../groups");
const plugins = require("../plugins");
module.exports = function (User) {
    function isUsernameAvailable(data, uid) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            if (!data.username) {
                return;
            }
            data.username =
                (_a = data.username) === null || _a === void 0
                    ? void 0
                    : _a.trim();
            let userData;
            if (uid) {
                userData = yield User.getUserFields(uid, [
                    "username",
                    "userslug",
                ]);
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
            const userslug = slugify(data.username);
            if (!utils.isUserNameValid(data.username) || !userslug) {
                throw new Error("[[error:invalid-username]]");
            }
            if (uid && userslug === userData.userslug) {
                return;
            }
            const exists = yield User.existsBySlug(userslug);
            if (exists) {
                throw new Error("[[error:username-taken]]");
            }
            const { error } = yield plugins.hooks.fire(
                "filter:username.check",
                {
                    username: data.username,
                    error: undefined,
                },
            );
            if (error) {
                throw error;
            }
        });
    }
    User.checkUsername = (username, uid) =>
        __awaiter(this, void 0, void 0, function* () {
            return isUsernameAvailable(username, uid);
        });
    function isWebsiteValid(callerUid, data) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!data.website) {
                return;
            }
            if (data.website.length > 255) {
                throw new Error("[[error:invalid-website]]");
            }
            yield User.checkMinReputation(
                callerUid,
                data.uid,
                "min:rep:website",
            );
        });
    }
    function isAboutMeValid(callerUid, data) {
        return __awaiter(this, void 0, void 0, function* () {
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
            yield User.checkMinReputation(
                callerUid,
                data.uid,
                "min:rep:aboutme",
            );
        });
    }
    function isSignatureValid(callerUid, data) {
        return __awaiter(this, void 0, void 0, function* () {
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
            yield User.checkMinReputation(
                callerUid,
                data.uid,
                "min:rep:signature",
            );
        });
    }
    function isFullnameValid(data) {
        if (
            data.fullname &&
            (validator_1.default.isURL(data.fullname) ||
                data.fullname.length > 255)
        ) {
            throw new Error("[[error:invalid-fullname]]");
        }
    }
    function isLocationValid(data) {
        if (
            data.location &&
            (validator_1.default.isURL(data.location) ||
                data.location.length > 255)
        ) {
            throw new Error("[[error:invalid-location]]");
        }
    }
    function isBirthdayValid(data) {
        if (!data.birthday) {
            return;
        }
        const result = new Date(data.birthday);
        if (result && result.toString() === "Invalid Date") {
            throw new Error("[[error:invalid-birthday]]");
        }
    }
    function isGroupTitleValid(data) {
        function checkTitle(title) {
            if (
                title === "registered-users" ||
                groups.isPrivilegeGroup(title)
            ) {
                throw new Error("[[error:invalid-group-title]]");
            }
        }
        if (!data.groupTitle) {
            return;
        }
        let groupTitles = [];
        if (validator_1.default.isJSON(data.groupTitle)) {
            groupTitles = JSON.parse(data.groupTitle);
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
    function isEmailValid(data) {
        if (!data.email) {
            return;
        }
        data.email = data.email.trim();
        if (!utils.isEmailValid(data.email)) {
            throw new Error("[[error:invalid-email]]");
        }
    }
    function validateData(callerUid, data) {
        return __awaiter(this, void 0, void 0, function* () {
            isEmailValid(data);
            yield isUsernameAvailable(data, data.uid);
            yield isWebsiteValid(callerUid, data);
            yield isAboutMeValid(callerUid, data);
            yield isSignatureValid(callerUid, data);
            isFullnameValid(data);
            isLocationValid(data);
            isBirthdayValid(data);
            isGroupTitleValid(data);
        });
    }
    User.checkMinReputation = function (callerUid, uid, setting) {
        return __awaiter(this, void 0, void 0, function* () {
            const roundedNumber1 = Math.round(uid * 10) / 10;
            const roundedNumber2 = Math.round(callerUid * 10) / 10;
            const isSelf = roundedNumber1 === roundedNumber2;
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            if (!isSelf || meta.config["reputation:disabled"]) {
                return;
            }
            const reputation = yield User.getUserField(uid, "reputation");
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            if (reputation < meta.config[setting]) {
                // The next line calls a function in a module that has not been updated to TS yet
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                throw new Error(
                    `[[error:not-enough-reputation-${setting.replace(
                        /:/g,
                        "-",
                    )}, ${String(meta.config[setting])}]]`,
                );
            }
        });
    };
    function updateEmail(uid, newEmail) {
        return __awaiter(this, void 0, void 0, function* () {
            let oldEmail = yield User.getUserField(uid, "email");
            oldEmail = oldEmail || "";
            if (oldEmail === newEmail) {
                return;
            }
            // 👉 Looking for email change logic? src/user/email.js (UserEmail.confirmByUid)
            if (newEmail) {
                // The next line calls a function in a module that has not been updated to TS yet
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                yield User.email
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
        });
    }
    function updateUidMapping(field, uid, value, oldValue) {
        return __awaiter(this, void 0, void 0, function* () {
            if (value === oldValue) {
                return;
            }
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            yield db.sortedSetRemove(`${field}:uid`, oldValue);
            yield User.setUserField(uid, field, value);
            if (value) {
                // The next line calls a function in a module that has not been updated to TS yet
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                yield db.sortedSetAdd(`${field}:uid`, uid, value);
            }
        });
    }
    function updateUsername(uid, newUsername) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!newUsername) {
                return;
            }
            const userData = (yield User.getUserFields(uid, [
                "username",
                "userslug",
            ])) || { username: "", userslug: "" };
            if (userData.username === newUsername) {
                return;
            }
            const newUserslug = slugify(newUsername);
            const now = Date.now();
            yield Promise.all([
                updateUidMapping(
                    "username",
                    uid,
                    newUsername,
                    userData.username,
                ),
                updateUidMapping(
                    "userslug",
                    uid,
                    newUserslug,
                    userData.userslug,
                ),
                // The next line calls a function in a module that has not been updated to TS yet
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                db.sortedSetAdd(
                    `user:${uid}:usernames`,
                    now,
                    `${newUsername}:${now}`,
                ),
            ]);
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            yield db.sortedSetRemove(
                "username:sorted",
                `${userData.username.toLowerCase()}:${uid}`,
            );
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            yield db.sortedSetAdd(
                "username:sorted",
                0,
                `${newUsername.toLowerCase()}:${uid}`,
            );
        });
    }
    function updateFullname(uid, newFullname) {
        return __awaiter(this, void 0, void 0, function* () {
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            const fullname = yield User.getUserField(uid, "fullname");
            yield updateUidMapping("fullname", uid, newFullname, fullname);
            if (newFullname !== fullname) {
                if (fullname) {
                    // The next line calls a function in a module that has not been updated to TS yet
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                    yield db.sortedSetRemove(
                        "fullname:sorted",
                        `${fullname.toLowerCase()}:${uid}`,
                    );
                }
                if (newFullname) {
                    // The next line calls a function in a module that has not been updated to TS yet
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                    yield db.sortedSetAdd(
                        "fullname:sorted",
                        0,
                        `${newFullname.toLowerCase()}:${uid}`,
                    );
                }
            }
        });
    }
    User.updateProfile = function (uid, data, extraFields) {
        return __awaiter(this, void 0, void 0, function* () {
            let fields = [
                "username",
                "email",
                "fullname",
                "website",
                "location",
                "groupTitle",
                "birthday",
                "signature",
                "aboutme",
            ];
            if (Array.isArray(extraFields)) {
                fields = _.uniq(fields.concat(extraFields));
            }
            if (!data.uid) {
                throw new Error("[[error:invalid-update-uid]]");
            }
            const updateUid = data.uid;
            const result = yield plugins.hooks.fire(
                "filter:user.updateProfile",
                {
                    uid: uid,
                    data: data,
                    fields: fields,
                },
            );
            fields = result.fields;
            data = result.data;
            yield validateData(uid, data);
            const oldData = yield User.getUserFields(updateUid, fields);
            const updateData = {};
            yield Promise.all(
                fields.map((field) =>
                    __awaiter(this, void 0, void 0, function* () {
                        if (
                            !(
                                data[field] !== undefined &&
                                typeof data[field] === "string"
                            )
                        ) {
                            return;
                        }
                        data[field] = data[field].trim();
                        if (field === "email") {
                            return yield updateEmail(updateUid, data.email);
                        } else if (field === "username") {
                            return yield updateUsername(
                                updateUid,
                                data.username,
                            );
                        } else if (field === "fullname") {
                            return yield updateFullname(
                                updateUid,
                                data.fullname,
                            );
                        }
                        updateData[field] = data[field];
                    }),
                ),
            );
            if (Object.keys(updateData).length) {
                yield User.setUserFields(updateUid, updateData);
            }
            const hookResult = plugins.hooks.fire("action:password.change", {
                uid: uid,
                data: data,
                fields: fields,
                oldData: oldData,
            });
            // Check if it's a promise and wait for it if needed
            if (hookResult instanceof Promise) {
                yield hookResult;
            }
            return yield User.getUserFields(updateUid, [
                "email",
                "username",
                "userslug",
                "picture",
                "icon:text",
                "icon:bgColor",
            ]);
        });
    };
    User.changePassword = function (uid, data) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (uid <= 0 || !data || !data.uid) {
                    throw new Error("[[error:invalid-uid]]");
                }
                User.isPasswordValid(data.newPassword);
                const [isAdmin, hasPassword] = yield Promise.all([
                    User.isAdministrator(uid),
                    User.hasPassword(uid),
                ]);
                // The next line calls a function in a module that has not been updated to TS yet
                /* eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,
                    @typescript-eslint/no-unsafe-call */
                if (meta.config["password:disableEdit"] && !isAdmin) {
                    throw new Error("[[error:no-privileges]]");
                }
                const roundedNumber1 = Math.round(uid * 10) / 10;
                const roundedNumber2 = Math.round(data.uid * 10) / 10;
                const isSelf = roundedNumber1 === roundedNumber2;
                if (!isAdmin && !isSelf) {
                    throw new Error(
                        "[[user:change_password_error_privileges]]",
                    );
                }
                if (isSelf && hasPassword) {
                    const correct = yield User.isPasswordCorrect(
                        data.uid,
                        data.currentPassword,
                        data.ip,
                    );
                    if (!correct) {
                        throw new Error(
                            "[[user:change_password_error_wrong_current]]",
                        );
                    }
                }
                const hashedPassword = yield User.hashPassword(
                    data.newPassword,
                );
                yield Promise.all([
                    User.setUserFields(data.uid, {
                        password: hashedPassword,
                        "password:shaWrapped": 1,
                        // The next line calls a function in a module that has not been updated to TS yet
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
                        rss_token: utils.generateUUID(),
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
                const hookResult = plugins.hooks.fire(
                    "action:password.change",
                    { uid: uid, targetUid: data.uid },
                );
                // Check if it's a promise and wait for it if needed
                if (hookResult instanceof Promise) {
                    yield hookResult;
                }
            } catch (error) {
                // Handle errors here, e.g., log the error or perform some other action.
                console.error(error);
                throw error; // Rethrow the error if needed
            }
        });
    };
};
