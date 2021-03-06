'use strict';

const AWS = require('aws-sdk');
const exec = require('child_process').exec;
const fs = require('fs');

process.env['PATH'] = `${process.env['PATH']}:${process.env['LAMBDA_TASK_ROOT']}`;

const s3 = new AWS.S3();

const saveMetadataToS3 = (body, bucket, key, callback) => {
    console.log('Saving metadata to S3...');
    s3.putObject({
        Bucket: bucket,
        Key: key,
        Body: body,
        ACL: 'public-read'
    }, (error, data) => {
        if (error) {
            callback(error);
        } else {
            console.log('Done!');
        }
    });
};

const extractMetadata = (sourceBucket, sourceKey, localFilename, callback) => {
    console.log('Extracting metadata...');

    const cmd = `bin/ffprobe -v quiet -print_format json -show_format "/tmp/${localFilename}"`;
    exec(cmd, (error, stdout, stderr) => {
        if (error === null) {
            const metadataKey = `${sourceKey.split('.')[0]}.json`;
            saveMetadataToS3(stdout, sourceBucket, metadataKey, callback);
        } else {
            console.log(stderr);
            callback(error);
        }
    });
};

const saveFileToFilesystem = (sourceBucket, sourceKey, callback) => {
    console.log('Saving to filesystem...');

    const localFilename = sourceKey.split('/').pop();
    const file = fs.createWriteStream(`/tmp/${localFilename}`);
    const stream = s3.getObject({
        Bucket: sourceBucket,
        Key: sourceKey
    }).createReadStream().pipe(file);

    stream.on('error', (error) => {
        callback(error);
    });

    stream.on('close', () => {
        extractMetadata(sourceBucket, sourceKey, localFilename, callback);
    });
};

exports.handler = (event, context, callback) => {
    const message = JSON.parse(event.Records[0].Sns.Message);
    const sourceBucket = message.Records[0].s3.bucket.name;
    const sourceKey = decodeURIComponent(message.Records[0].s3.object.key.replace(/\+/g, " "));
    saveFileToFilesystem(sourceBucket, sourceKey, callback);
};
