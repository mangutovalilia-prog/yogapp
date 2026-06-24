#!/bin/zsh
cd ~/йога
STYLE="Single woman, full body visible, soft natural lighting, peaceful minimal warm beige background, calm wellness aesthetic, wearing cream yoga top and taupe leggings."

gen() {
  local id="$1"; local pose="$2"
  echo "=== $id ==="
  local url=$(higgsfield generate create z_image --prompt "A woman performing $pose. $STYLE" --wait 2>/dev/null | tail -1)
  if [[ "$url" == http* ]]; then
    curl -s -o "videos/$id.png" "$url" && echo "saved videos/$id.png"
  else
    echo "FAILED $id: $url"
  fi
}

gen virabhadrasana1 "Virabhadrasana I Warrior 1 Pose, front knee bent in a lunge, back leg straight, both arms reaching up overhead, chest lifted, side view"
gen anjaneyasana "Anjaneyasana Low Lunge, back knee down on the floor, front knee bent, arms reaching up overhead, gentle backbend, side view"
gen navasana "Navasana Boat Pose, balancing on sit bones, legs lifted straight at an angle, arms extended forward parallel to floor, V-shape, side view"
echo "ALL DONE"
