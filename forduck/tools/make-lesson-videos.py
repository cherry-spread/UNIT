"""Build local replacement lessons using the captured posters and timed cues."""
import argparse
import json
import re
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "lesson-videos"
LANGUAGES = {"ko": "kor", "en": "eng", "vi": "vie", "th": "tha", "id": "ind", "bn": "ben"}


def timestamp(seconds):
    total_ms = round(seconds * 1000)
    seconds, ms = divmod(total_ms, 1000)
    minutes, seconds = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{ms:03d}"


def make_video(lesson, ffmpeg):
    poster = ROOT / "external" / lesson["poster"].rsplit("/", 1)[1]
    cues = lesson["cues"]
    duration = cues[-1]["end"] + 0.4
    with TemporaryDirectory(prefix="forduck-lesson-", dir=OUTPUT) as directory:
        work = Path(directory)
        command = [ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin",
                   "-loop", "1", "-framerate", "25", "-i", str(poster)]
        audio_filters = []
        for index, cue in enumerate(cues, 1):
            speech = work / f"cue-{index}.aiff"
            subprocess.run(["say", "-v", "Yuna", "-r", "155", "-o", str(speech), cue["ko"]], check=True)
            info = subprocess.check_output(["afinfo", str(speech)], text=True)
            spoken = float(re.search(r"estimated duration: ([\d.]+)", info)[1])
            window = cue["end"] - cue["start"] - 0.15
            speed = max(1.0, spoken / window)
            command.extend(["-i", str(speech)])
            delay = round(cue["start"] * 1000)
            audio_filters.append(f"[{index}:a]atempo={speed:.6f},adelay={delay}[a{index}]")
        inputs = "".join(f"[a{i}]" for i in range(1, len(cues) + 1))
        audio_filters.append(f"{inputs}amix=inputs={len(cues)}:normalize=0,apad[audio]")

        for language in LANGUAGES:
            srt = work / f"{language}.srt"
            entries = []
            for index, cue in enumerate(cues, 1):
                lines = [cue["ko"], cue["roman"]]
                if language != "ko":
                    lines.append(cue["tr"][language])
                entries.append("\n".join([
                    str(index), f'{timestamp(cue["start"])} --> {timestamp(cue["end"])}', *lines,
                ]))
            srt.write_text("\n\n".join(entries) + "\n", encoding="utf-8")
            command.extend(["-i", str(srt)])

        command.extend(["-filter_complex", ";".join(audio_filters), "-map", "0:v", "-map", "[audio]"])
        for index, (language, code) in enumerate(LANGUAGES.items()):
            command.extend(["-map", f"{len(cues) + 1 + index}:s", f"-metadata:s:s:{index}", f"language={code}",
                            f"-disposition:s:{index}", "0"])
        result = work / f'{lesson["id"]}.mp4'
        command.extend([
            "-t", f"{duration:.3f}", "-vf",
            "scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1",
            "-c:v", "libx264", "-preset", "fast", "-tune", "stillimage", "-crf", "22", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "96k", "-ar", "44100", "-metadata:s:a:0", "language=kor",
            "-c:s", "mov_text", "-metadata", f'title={lesson["title"]} (대체 학습 영상)',
            "-movflags", "+faststart", str(result),
        ])
        subprocess.run(command, check=True)
        result.replace(OUTPUT / result.name)
        print(f'{lesson["title"]}: {duration:.1f}s · {result.name}', flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ffmpeg", default="ffmpeg")
    args = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for lesson in json.loads((ROOT / "data" / "videos.json").read_text()):
        make_video(lesson, args.ffmpeg)
