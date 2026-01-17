#!/bin/bash

cat <<EOF > server.sh

while true; do
  echo "Hello client" | nc -l -p 25565 -q 1
done

EOF

chmod +x server.sh
