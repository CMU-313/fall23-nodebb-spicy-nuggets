'use strict';

import async from 'async';
import validator from 'validator';
import _ from 'lodash';

import db from '../database';
import user from '../user';
import topics from '../topics';
import groups from '../groups';
import meta from '../meta';
import plugins from '../plugins';
import privileges from '../privileges';



export default function (Posts: any) {
    Posts.getUserInfoForPosts = async function (uids: number[], uid: number) {
        const [userData, userSettings, signatureUids] = await Promise.all([
            getUserData(uids, uid),
            user.getMultipleUserSettings(uids),
            privileges.global.filterUids('signature', uids),
        ]);
        const uidsSignatureSet = new Set<number>(signatureUids.map(uid => parseInt(uid, 10)));
        const groupsMap = await getGroupsMap(userData);

        userData.forEach((userData: any, index: number) => {
            userData.signature = validator.escape(String(userData.signature || ''));
            userData.fullname = userSettings[index].showfullname ? validator.escape(String(userData.fullname || '')) : undefined;
            userData.selectedGroups = [];

            if (meta.config.hideFullname) {
                userData.fullname = "Anonymous";
            }
        });

        const result = await Promise.all(userData.map(async (userData) => {
            const [isMemberOfGroups, signature, customProfileInfo] = await Promise.all([
                checkGroupMembership(userData.uid, userData.groupTitleArray),
                parseSignature(userData, uid, uidsSignatureSet),
                plugins.hooks.fire('filter:posts.custom_profile_info', { profile: [], uid: userData.uid }),
            ]);

            if (isMemberOfGroups && userData.groupTitleArray) {
                userData.groupTitleArray.forEach((userGroup: any, index: number) => {
                    if (isMemberOfGroups[index] && groupsMap[userGroup]) {
                        userData.selectedGroups.push(groupsMap[userGroup]);
                    }
                });
            }
            userData.signature = signature;
            userData.custom_profile_info = customProfileInfo.profile;

            return await plugins.hooks.fire('filter:posts.modifyUserInfo', userData);
        }));
        const hookResult = await plugins.hooks.fire('filter:posts.getUserInfoForPosts', { users: result });
        return hookResult.users;
    };

    Posts.overrideGuestHandle = function (postData: any, handle: string) {
        if (meta.config.allowGuestHandles && postData && postData.user && parseInt(postData.uid, 10) === 0 && handle) {
            postData.user.username = validator.escape(String(handle));
            if (postData.user.hasOwnProperty('fullname')) {
                postData.user.fullname = postData.user.username;
            }
            postData.user.displayname = postData.user.username;
        }
    };    

    async function checkGroupMembership(uid: number, groupTitleArray: string[] | undefined) {
        if (!Array.isArray(groupTitleArray) || !groupTitleArray.length) {
            return null;
        }
        return await groups.isMemberOfGroups(uid, groupTitleArray);
    }    

    async function parseSignature(userData: any, uid: number, signatureUids: Set<number>) {
        if (!userData.signature || !signatureUids.has(userData.uid) || meta.config.disableSignatures) {
            return '';
        }
        const result = await Posts.parseSignature(userData, uid);
        return result.userData.signature;
    }    

    async function getGroupsMap(userData: any[]) {
        const groupTitles = _.uniq(_.flatten(userData.map(u => u && u.groupTitleArray))) as string[];
        const groupsMap: Record<string, any> = {};
        const groupsData = await groups.getGroupsData(groupTitles);
    
        groupsData.forEach((group: any) => {
            if (group && group.userTitleEnabled && !group.hidden) {
                groupsMap[group.name] = {
                    name: group.name,
                    slug: group.slug,
                    labelColor: group.labelColor,
                    textColor: group.textColor,
                    icon: group.icon,
                    userTitle: group.userTitle,
                };
            }
        });
    
        return groupsMap;
    }
    
    async function getUserData(uids: number[], uid: number) {
        const fields = [
            'uid', 'username', 'fullname', 'userslug',
            'reputation', 'postcount', 'topiccount', 'picture',
            'signature', 'banned', 'banned:expire', 'status',
            'lastonline', 'groupTitle', 'mutedUntil',
        ];
        const result = await plugins.hooks.fire('filter:posts.addUserFields', {
            fields: fields,
            uid: uid,
            uids: uids,
        }) as { uids: number[]; fields: string[] };
    
        return await user.getUsersFields(result.uids, _.uniq(result.fields)) as any[];
    }    

    Posts.isOwner = async function (pids: number | number[], uid: number) {
        uid = parseInt(uid.toString(), 10);
        const isArray = Array.isArray(pids);
        const pidArray = isArray ? (pids as number[]) : [pids]; // Use type assertion here
    
        if (uid <= 0) {
            return isArray ? pidArray.map(() => false) : false;
        }
        
        const postData = await Posts.getPostsFields(pidArray, ['uid']);
        const result = postData.map((post: any) => post && post.uid === uid);
        
        return isArray ? result : result[0];
    };
    

    Posts.isModerator = async function (pids: number[], uid: number) {
        if (parseInt(uid.toString(), 10) <= 0) {
            return pids.map(() => false);
        }
        const cids = await Posts.getCidsByPids(pids);
        return await user.isModerator(uid, cids);
    };    

    Posts.changeOwner = async function (pids: number | number[], toUid: number) {
        const exists = await user.exists(toUid);
        if (!exists) {
            throw new Error('[[error:no-user]]');
        }
        let postData = await Posts.getPostsFields(pids, [
            'pid', 'tid', 'uid', 'content', 'deleted', 'timestamp', 'upvotes', 'downvotes',
        ]);
        postData = postData.filter((post: any) => post.pid && post.uid !== parseInt(toUid.toString(), 10));
        pids = postData.map((post: any) => post.pid);
    
        const cids = await Posts.getCidsByPids(pids);
    
        const bulkRemove: any[] = [];
        const bulkAdd: any[] = [];
        let repChange = 0;
        const postsByUser: { [key: string]: any[] } = {};
        postData.forEach((post: any, i: number) => {
            post.cid = cids[i];
            repChange += post.votes;
            bulkRemove.push([`uid:${post.uid}:posts`, post.pid]);
            bulkRemove.push([`cid:${post.cid}:uid:${post.uid}:pids`, post.pid]);
            bulkRemove.push([`cid:${post.cid}:uid:${post.uid}:pids:votes`, post.pid]);
    
            bulkAdd.push([`uid:${toUid}:posts`, post.timestamp, post.pid]);
            bulkAdd.push([`cid:${post.cid}:uid:${toUid}:pids`, post.timestamp, post.pid]);
            if (post.votes > 0 || post.votes < 0) {
                bulkAdd.push([`cid:${post.cid}:uid:${toUid}:pids:votes`, post.votes, post.pid]);
            }
            postsByUser[post.uid] = postsByUser[post.uid] || [];
            postsByUser[post.uid].push(post);
        });
    
        await Promise.all([
            db.setObjectField((pids as number[]).map((pid: number) => `post:${pid}`), 'uid', toUid),
            db.sortedSetRemoveBulk(bulkRemove),
            db.sortedSetAddBulk(bulkAdd),
            user.incrementUserReputationBy(toUid, repChange),
            handleMainPidOwnerChange(postData, toUid),
            updateTopicPosters(postData, toUid),
        ]);        
    
        await Promise.all([
            user.updatePostCount(toUid),
            reduceCounters(postsByUser),
        ]);
    
        plugins.hooks.fire('action:post.changeOwner', {
            posts: _.cloneDeep(postData),
            toUid: toUid,
        });
        return postData;
    };
    
    async function reduceCounters(postsByUser: { [key: string]: any[] }) {
        await async.eachOfSeries(postsByUser, async (posts: any[], uid: string) => {
            const repChange = posts.reduce((acc, val) => acc + val.votes, 0);
            await Promise.all([
                user.updatePostCount(parseInt(uid, 10)),
                user.incrementUserReputationBy(parseInt(uid, 10), -repChange),
            ]);
        });
    }    

    async function updateTopicPosters(postData: any[], toUid: number) {
        const postsByTopic = _.groupBy(postData, (p: any) => parseInt(p.tid, 10));
        await async.eachOf(postsByTopic, async (posts: any[], tid: string) => {
            const postsByUser = _.groupBy(posts, (p: any) => parseInt(p.uid, 10));
            await db.sortedSetIncrBy(`tid:${tid}:posters`, posts.length, toUid);
            await async.eachOf(postsByUser, async (userPosts: any[], uid: string) => {
                await db.sortedSetIncrBy(`tid:${tid}:posters`, -userPosts.length, parseInt(uid, 10));
            });
        });
    }    

    async function handleMainPidOwnerChange(postData: any[], toUid: number) {
        const tids = _.uniq(postData.map((p: any) => p.tid));
        const topicData = await topics.getTopicsFields(tids, [
            'tid', 'cid', 'deleted', 'title', 'uid', 'mainPid', 'timestamp',
        ]);
        const tidToTopic = _.zipObject(tids, topicData);
    
        const mainPosts = postData.filter((post: any) => post.pid === tidToTopic[post.tid].mainPid);
        if (!mainPosts.length) {
            return;
        }
    
        const bulkAdd: any[] = [];
        const bulkRemove: any[] = [];
        const postsByUser: { [key: string]: any[] } = {};
        mainPosts.forEach((post: any) => {
            bulkRemove.push([`cid:${post.cid}:uid:${post.uid}:tids`, post.tid]);
            bulkRemove.push([`uid:${post.uid}:topics`, post.tid]);
    
            bulkAdd.push([`cid:${post.cid}:uid:${toUid}:tids`, tidToTopic[post.tid].timestamp, post.tid]);
            bulkAdd.push([`uid:${toUid}:topics`, tidToTopic[post.tid].timestamp, post.tid]);
            postsByUser[post.uid] = postsByUser[post.uid] || [];
            postsByUser[post.uid].push(post);
        });
    
        await Promise.all([
            db.setObjectField(mainPosts.map((p: any) => `topic:${p.tid}`), 'uid', toUid),
            db.sortedSetRemoveBulk(bulkRemove),
            db.sortedSetAddBulk(bulkAdd),
            user.incrementUserFieldBy(toUid, 'topiccount', mainPosts.length),
            reduceTopicCounts(postsByUser),
        ]);
    
        const changedTopics = mainPosts.map((p: any) => tidToTopic[p.tid]);
        plugins.hooks.fire('action:topic.changeOwner', {
            topics: _.cloneDeep(changedTopics),
            toUid: toUid,
        });
    }
    

    async function reduceTopicCounts(postsByUser: { [key: string]: any[] }) {
        await async.eachSeries(Object.keys(postsByUser), async (uid: string) => {
            const posts = postsByUser[uid];
            const exists = await user.exists(parseInt(uid, 10));
            if (exists) {
                await user.incrementUserFieldBy(parseInt(uid, 10), 'topiccount', -posts.length);
            }
        });
    }    
};
