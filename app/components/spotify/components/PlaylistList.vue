<script setup lang="ts">
defineEmits<{ (e: 'open-liked'): void }>()
// ... le reste de ton composant
</script>

<template>
  <UPage>
    <UPageHeader title="Playlists" description="Vos playlists Spotify." />
    <UPageBody>
      <!-- barre de recherche / bouton créer ... -->

      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <!-- Tuile Titres likés -->
        <UCard class="hover:bg-elevated/40 cursor-pointer" @click="$emit('open-liked')">
          <template #header>
            <div class="flex items-center gap-3">
              <div class="h-16 w-16 rounded bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center">
                <UIcon name="i-lucide-heart" class="text-white size-6" />
              </div>
              <div class="min-w-0">
                <div class="truncate font-medium">Titres likés</div>
                <p class="text-xs text-dimmed truncate">Tous vos coups de cœur</p>
              </div>
            </div>
          </template>
        </UCard>

        <!-- puis tes cartes playlists existantes -->
        <!-- ... -->
      </div>
    </UPageBody>
  </UPage>
</template>

