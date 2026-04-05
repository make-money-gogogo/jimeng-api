import _ from 'lodash';

export default {

    prefix: '/v1',

    get: {
        '/models': async () => {
            return {
                "data": [
                    // ── 图像模型（国内站） ──
                    { "id": "jimeng-5.0", "object": "model", "owned_by": "jimeng-api", "type": "image", "region": "cn" },
                    { "id": "jimeng-4.6", "object": "model", "owned_by": "jimeng-api", "type": "image", "region": "cn" },
                    { "id": "jimeng-4.5", "object": "model", "owned_by": "jimeng-api", "type": "image", "region": "cn,us,asia" },
                    { "id": "jimeng-4.1", "object": "model", "owned_by": "jimeng-api", "type": "image", "region": "cn,us,asia" },
                    { "id": "jimeng-4.0", "object": "model", "owned_by": "jimeng-api", "type": "image", "region": "cn,us,asia" },
                    { "id": "jimeng-3.1", "object": "model", "owned_by": "jimeng-api", "type": "image", "region": "cn" },
                    { "id": "jimeng-3.0", "object": "model", "owned_by": "jimeng-api", "type": "image", "region": "cn,us,asia" },
                    { "id": "nanobanana", "object": "model", "owned_by": "jimeng-api", "type": "image", "region": "us,asia" },
                    { "id": "nanobananapro", "object": "model", "owned_by": "jimeng-api", "type": "image", "region": "us,asia" },

                    // ── 视频模型 Seedance 2.0（国内站） ──
                    { "id": "jimeng-video-seedance-2.0", "object": "model", "owned_by": "jimeng-api", "type": "video", "region": "cn", "description": "Seedance 2.0 Pro，4~15秒" },
                    { "id": "jimeng-video-seedance-2.0-fast", "object": "model", "owned_by": "jimeng-api", "type": "video", "region": "cn", "description": "Seedance 2.0 Fast，4~15秒" },
                    { "id": "jimeng-video-seedance-2.0-vip", "object": "model", "owned_by": "jimeng-api", "type": "video", "region": "cn", "description": "Seedance 2.0 Pro VIP，720p 输出，4~15秒" },
                    { "id": "jimeng-video-seedance-2.0-fast-vip", "object": "model", "owned_by": "jimeng-api", "type": "video", "region": "cn", "description": "Seedance 2.0 Fast VIP，720p 输出，4~15秒" },

                    // ── 视频模型 3.x / 2.x ──
                    { "id": "jimeng-video-3.5-pro", "object": "model", "owned_by": "jimeng-api", "type": "video", "region": "cn,us,asia", "description": "3.5 Pro，5/10/12秒" },
                    { "id": "jimeng-video-3.0-pro", "object": "model", "owned_by": "jimeng-api", "type": "video", "region": "cn,asia", "description": "3.0 Pro，5/10秒" },
                    { "id": "jimeng-video-3.0", "object": "model", "owned_by": "jimeng-api", "type": "video", "region": "cn,us,asia", "description": "3.0 标准，5/10秒" },
                    { "id": "jimeng-video-3.0-fast", "object": "model", "owned_by": "jimeng-api", "type": "video", "region": "cn,asia", "description": "3.0 Fast，5/10秒" },
                    { "id": "jimeng-video-2.0", "object": "model", "owned_by": "jimeng-api", "type": "video", "region": "cn,asia", "description": "2.0 标准，5/10秒" },
                    { "id": "jimeng-video-2.0-pro", "object": "model", "owned_by": "jimeng-api", "type": "video", "region": "cn,asia", "description": "2.0 Pro，5/10秒" },

                    // ── 国际视频模型（亚洲国际站 HK/JP/SG） ──
                    { "id": "jimeng-video-veo3", "object": "model", "owned_by": "jimeng-api", "type": "video", "region": "asia", "description": "Google Veo3，固定8秒" },
                    { "id": "jimeng-video-veo3.1", "object": "model", "owned_by": "jimeng-api", "type": "video", "region": "asia", "description": "Google Veo3.1，固定8秒" },
                    { "id": "jimeng-video-sora2", "object": "model", "owned_by": "jimeng-api", "type": "video", "region": "asia", "description": "OpenAI Sora2，4/8/12秒" },
                ]
            };
        }

    }
}