"""Render the trajectory videos for the project page from OGBench dataset episodes.

Each video replays a segment of one offline dataset episode by setting the simulator to the
recorded state at every step. The segments are the ones shown on the page: the episode and steps
were identified by matching the plotted empowerment data against the datasets. Alongside each video we save the agent's 3D position per frame and
the camera's 3x4 projection matrix (one per frame for the moving Ant-Soccer camera), so the page
can draw the agent's path over the video exactly.

Run with the offline_empowerment venv (needs ogbench + mujoco) and the datasets in ~/.ogbench/data:
    MUJOCO_GL=glfw python scripts/render_trajectories.py [antmaze pointmaze antsoccer cube]
"""
import json
import os
import subprocess
import sys

import mujoco
import numpy as np
import ogbench

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.expanduser("~/.ogbench/data")

# name: dataset, episode, first step, number of frames, fps, frame size
SPECS = {
    "antmaze": dict(dataset="antmaze-medium-navigate-v0", episode=213, start=190, frames=451, fps=30, size=(720, 720)),
    "pointmaze": dict(dataset="pointmaze-teleport-navigate-v0", episode=129, start=60, frames=371, fps=30, size=(856, 640)),
    "antsoccer": dict(dataset="antsoccer-arena-navigate-v0", episode=373, start=408, frames=193, fps=15, size=(840, 680)),
    "cube": dict(dataset="cube-single-play-v0", episode=850, start=0, frames=74, fps=12, size=(840, 680)),
}
EPISODE_LEN = 1001
TELEPORT_JUMP = 1.0  # world units; larger per-step moves in PointMaze-Teleport are teleports


def make_env(dataset, width, height):
    env = ogbench.make_env_and_datasets(dataset, env_only=True)
    u = env.unwrapped
    env.reset(seed=0)
    m = u.model
    for i in range(m.ngeom):  # hide goal markers
        if (mujoco.mj_id2name(m, mujoco.mjtObj.mjOBJ_GEOM, i) or "").startswith("target"):
            m.geom_rgba[i, 3] = 0
    m.vis.global_.offwidth = max(width, m.vis.global_.offwidth)
    m.vis.global_.offheight = max(height, m.vis.global_.offheight)
    return u, mujoco.Renderer(m, height=height, width=width)


def projection_matrix(renderer):
    """3x4 matrix P with [u*w, v*w, w] = P @ [x, y, z, 1] for the camera last passed to update_scene."""
    cam = renderer.scene.camera[0]
    pos, fwd, up = np.array(cam.pos), np.array(cam.forward), np.array(cam.up)
    right = np.cross(fwd, up)
    W, H = renderer.width, renderer.height
    c, hw, b, t, n = cam.frustum_center, cam.frustum_width, cam.frustum_bottom, cam.frustum_top, cam.frustum_near
    if hw == 0:  # MuJoCo derives the half-width from the viewport aspect ratio
        hw = 0.5 * (t - b) * W / H
    K = np.array([
        [n * W / (2 * hw), 0, (hw - c) * W / (2 * hw)],
        [0, -n * H / (t - b), t * H / (t - b)],
        [0, 0, 1],
    ])
    R = np.stack([right, up, fwd])
    return K @ np.c_[R, -R @ pos]


def topdown_camera(m, d, width, height, zoom):
    lo, hi = np.full(2, np.inf), np.full(2, -np.inf)
    for i in range(m.ngeom):
        if (mujoco.mj_id2name(m, mujoco.mjtObj.mjOBJ_GEOM, i) or "").startswith("block"):
            p, s = d.geom_xpos[i][:2], m.geom_size[i][:2]
            lo, hi = np.minimum(lo, p - s), np.maximum(hi, p + s)
    half = (hi - lo) / 2 * zoom
    cam = mujoco.MjvCamera()
    cam.lookat[:] = [*(lo + hi) / 2, 0]
    cam.azimuth, cam.elevation = 90, -90
    cam.distance = max(half[1], half[0] * height / width) / np.tan(np.radians(m.vis.global_.fovy / 2))
    return cam


def free_camera(lookat, azimuth, elevation, distance):
    cam = mujoco.MjvCamera()
    cam.lookat[:] = lookat
    cam.azimuth, cam.elevation, cam.distance = azimuth, elevation, distance
    return cam


def smooth(x, sigma):
    k = np.arange(-int(3 * sigma), int(3 * sigma) + 1)
    g = np.exp(-k ** 2 / (2 * sigma ** 2))
    g /= g.sum()
    pad = np.pad(x, ((len(k) // 2, len(k) // 2), (0, 0)), mode="edge")
    return np.stack([np.convolve(pad[:, j], g, mode="valid") for j in range(x.shape[1])], 1)


def render(name):
    spec = SPECS[name]
    W, H = spec["size"]
    u, renderer = make_env(spec["dataset"], W, H)
    m, d = u.model, u.data
    D = np.load(os.path.join(DATA, spec["dataset"] + ".npz"))
    steps = spec["episode"] * EPISODE_LEN + spec["start"] + np.arange(spec["frames"])
    qpos, qvel = D["qpos"][steps], D["qvel"][steps]

    if name == "cube":
        point_id = mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_SITE, "ur5e/robotiq/pinch")
        point = lambda: d.site_xpos[point_id].copy()
    else:
        torso = mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_BODY, "torso")
        if name == "antsoccer":  # path on the floor under the ant
            point = lambda: np.r_[d.xpos[torso][:2], 0.0]
        else:
            point = lambda: d.xpos[torso].copy()

    if name == "antsoccer":  # follow the ant and ball smoothly
        lookat = smooth((qpos[:, 0:2] + qpos[:, 15:17]) / 2, sigma=8)

    out = os.path.join(ROOT, "static", "videos", name + ".mp4")
    ff = subprocess.Popen([
        "ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
        "-r", str(spec["fps"]), "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "20",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", out,
    ], stdin=subprocess.PIPE)

    pts, cams, cam = [], [], None
    for k in range(spec["frames"]):
        u.set_state(qpos[k], qvel[k])
        mujoco.mj_forward(m, d)
        if name in ("antmaze", "pointmaze"):
            cam = cam or topdown_camera(m, d, W, H, zoom=0.95 if name == "antmaze" else 0.97)
        elif name == "antsoccer":
            cam = free_camera([*lookat[k], 0], 90, -42, 7.3)
        else:
            cam = cam or free_camera([0.4, 0.0, 0.17], 155, -15, 0.97)
        renderer.update_scene(d, camera=cam)
        frame = renderer.render()
        ff.stdin.write(frame.tobytes())
        if k == 0:
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                            "-i", "-", "-q:v", "3", os.path.join(ROOT, "static", "videos", name + "_poster.jpg")],
                           input=frame.tobytes(), check=True)
        pts.append(point())
        cams.append(projection_matrix(renderer))
    ff.stdin.close()
    ff.wait()

    pts = np.array(pts)
    if name in ("antmaze", "antsoccer"):  # the ant's torso wobbles with its gait; smooth the drawn path slightly
        pts = smooth(pts, sigma=2)
    moving = name == "antsoccer"
    traj_path = os.path.join(ROOT, "static", "data", name + "_traj.json")
    traj = json.load(open(traj_path))
    assert len(traj["emp"]) == spec["frames"], (len(traj["emp"]), spec["frames"])
    for key in ("px", "breaks"):
        traj.pop(key, None)
    traj["source"] = {k: spec[k] for k in ("dataset", "episode", "start")}
    traj["frame"] = [W, H]
    traj["pts"] = np.round(pts, 4).tolist()
    traj["cam"] = [np.round(P, 5).ravel().tolist() for P in cams] if moving else np.round(cams[0], 5).ravel().tolist()
    if name == "pointmaze":
        jumps = np.linalg.norm(np.diff(pts[:, :2], axis=0), axis=1)
        traj["breaks"] = [int(i) + 1 for i in np.nonzero(jumps > TELEPORT_JUMP)[0]]
    json.dump(traj, open(traj_path, "w"), separators=(",", ":"))
    print(f"{name}: {spec['frames']} frames -> {out}" + (f", teleports at {traj['breaks']}" if "breaks" in traj else ""))


if __name__ == "__main__":
    for name in sys.argv[1:] or SPECS:
        render(name)
