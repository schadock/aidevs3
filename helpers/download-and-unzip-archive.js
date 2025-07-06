import { promises as fs, createWriteStream } from 'fs';
import https from 'https';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const fileUrl = 'https://c3ntrala.ag3nts.org/dane/pliki_z_fabryki.zip';
const zipFileName = 'pliki_z_fabryki.zip';
const extractDir = 'archive';

const getRemoteFileSize = (url) => {
  return new Promise((resolve, reject) => {
    const request = https.request(url, { method: 'HEAD' }, (res) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        resolve(parseInt(res.headers['content-length'], 10));
      } else {
        reject(new Error(`Server responded with status code: ${res.statusCode}`));
      }
    });
    request.on('error', reject);
    request.end();
  });
};

const getLocalFileSize = async (filePath) => {
  try {
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return -1; // File does not exist
    }
    throw error;
  }
};

const downloadFile = (url, dest) => {
  return new Promise((resolve, reject) => {
    const fileStream = createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
        return;
      }
      response.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest).catch(() => {}); // Try to clean up, but don't fail if it doesn't exist
      reject(err.message);
    });
  });
};

const unzipFile = async (zipPath, destDir) => {
    console.log(`Unzipping ${zipPath} to ${destDir}...`);
    try {
        await execAsync(`unzip -o -q "${zipPath}" -d "${destDir}"`);
        console.log('Unzip successful.');
    } catch (error) {
        console.error('Error unzipping file:', error);
        throw error;
    }
};

const main = async () => {
  try {
    console.log('Checking file status...');
    const remoteSize = await getRemoteFileSize(fileUrl);
    const localSize = await getLocalFileSize(zipFileName);

    let needsDownload = false;
    if (localSize === -1) {
      console.log('Local file does not exist. Downloading...');
      needsDownload = true;
    } else if (remoteSize !== localSize) {
      console.log(`File size mismatch. Local: ${localSize}, Remote: ${remoteSize}. Redownloading...`);
      needsDownload = true;
    } else {
      console.log('Local file is up to date.');
    }

    if (needsDownload) {
      console.log('Downloading file...');
      await downloadFile(fileUrl, zipFileName);
      console.log('Download complete.');
      
      console.log(`Removing old directory ${extractDir} if it exists...`);
      await fs.rm(extractDir, { recursive: true, force: true });

      await unzipFile(zipFileName, extractDir);
    } else {
        try {
            await fs.access(extractDir);
            console.log(`'${extractDir}' directory already exists.`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log(`'${extractDir}' directory does not exist. Unzipping...`);
                await unzipFile(zipFileName, extractDir);
            } else {
                throw error;
            }
        }
    }
    
    console.log('Script finished successfully.');

  } catch (error) {
    console.error('An error occurred:', error.message);
  }
};

main();

