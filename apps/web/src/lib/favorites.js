const KEY = "perto_favorites";

export const getFavorites = () => JSON.parse(localStorage.getItem(KEY) || "[]");
export const isFavorite = (id) => getFavorites().includes(id);
export const toggleFavorite = (id) => {
  const list = getFavorites();
  const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  localStorage.setItem(KEY, JSON.stringify(next));
  return next.includes(id);
};