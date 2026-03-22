import environment from '@/lib/environment.ts';
import images from "./images.ts";
import ping from "./ping.ts";
import token from './token.js';
import models from './models.ts';
import documentation from "./documentation.ts";
import videos from './videos.ts';

export default [
    {
        get: {
            '/': async () => {
                return {
                    service: 'jimeng-api',
                    status: 'running',
                    version: environment.package.version,
                    description: '图像与视频能力 HTTP 服务（部分接口兼容 OpenAI 风格）',
                    documentation: '/v1/docs',
                    endpoints: {
                        docs: '/v1/docs',
                        docs_markdown: '/v1/docs?format=markdown',
                        images: '/v1/images/generations',
                        images_async_status: '/v1/images/generations/status',
                        compositions: '/v1/images/compositions',
                        videos: '/v1/videos/generations',
                        videos_async_status: '/v1/videos/generations/status',
                        models: '/v1/models',
                        health: '/ping'
                    }
                };
            }
        }
    },
    images,
    ping,
    token,
    models,
    documentation,
    videos
];
