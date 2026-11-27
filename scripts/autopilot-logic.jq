map(
  select(.state == "open" and (has("pull_request") | not))
  | select(([.labels[].name] | index("bloqué")) == null)
  | select(.number as $number | ($associated | index($number)) == null)
  | select(all(
      (.body // "" | scan("Dépend de #([0-9]+)")[0] | tonumber);
      . as $dependency | $closed | index($dependency) != null
    ))
)
| sort_by(.number)
| first // empty
| .number
