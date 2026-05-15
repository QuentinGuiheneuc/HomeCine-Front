<script setup lang="ts">
import * as z from 'zod'
import { ref, reactive, onMounted } from 'vue'
import { GetUserProfile } from '../../src/api/user'

const fileRef = ref<HTMLInputElement>()

type UserProfile = {
  name?: string
  email?: string
  settings?: {
    ui?: {
      primary?: string
      neutral?: string
    }
  }
  appearance?: string
}

const profileSchema = z.object({
  name: z.string().min(2, 'Too short'),
  email: z.string().email('Invalid email'),
  avatar: z.string().optional()
})

type ProfileSchema = z.output<typeof profileSchema>

const profile = reactive<ProfileSchema>({
  name: '',
  email: '',
  avatar: ''
})

const user = ref<UserProfile | null>(null)

const toast = useToast()

async function onSubmit(event: { data: ProfileSchema }) {
  console.log('SUBMIT =>', event.data)

  toast.add({
    title: 'Success',
    description: 'Your settings have been updated.',
    icon: 'i-lucide-check',
    color: 'success'
  })
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement

  if (!input.files?.length) return

  const file = input.files[0]

  profile.avatar = URL.createObjectURL(file)

  toast.add({
    title: 'Success',
    description: 'Avatar updated.',
    icon: 'i-lucide-check',
    color: 'success'
  })
}

function onFileClick() {
  fileRef.value?.click()
}

async function onUser() {
  try {
    const res = await GetUserProfile()

    // si API retourne un tableau
    const data = Array.isArray(res) ? res[0] : res

    user.value = data

    profile.name = data?.name || ''
    profile.email = data?.email || ''
  }
  catch (error) {
    console.error('Failed to load user profile:', error)
  }
}

onMounted(() => {
  onUser()
})
</script>

<template>
  <UForm
    :schema="profileSchema"
    :state="profile"
    class="space-y-4"
    @submit="onSubmit"
  >
    <UPageCard
      title="Profile"
      description="These informations will be displayed publicly."
      variant="naked"
      orientation="horizontal"
      class="mb-4"
    >
      <UButton
        label="Save changes"
        color="neutral"
        type="submit"
        class="w-fit lg:ms-auto"
      />
    </UPageCard>

    <UPageCard variant="subtle">
      <UFormField
        name="name"
        label="Name"
        :description="`Will appear on receipts, invoices, and other communication.`"
        required
        class="flex max-sm:flex-col justify-between items-start gap-4"
      >
        <UInput
          v-model="profile.name"
          autocomplete="off"
          placeholder="Your name"
        />
      </UFormField>

      <USeparator />

      <UFormField
        name="email"
        label="Email"
        :description="`Used to sign in, for email receipts and product updates.`"
        required
        class="flex max-sm:flex-col justify-between items-start gap-4"
      >
        <UInput
          v-model="profile.email"
          type="email"
          autocomplete="off"
          placeholder="Your email"
        />
      </UFormField>

      <USeparator />

      <UFormField
        name="avatar"
        label="Avatar"
        description="JPG, GIF or PNG. 1MB Max."
        class="flex max-sm:flex-col justify-between sm:items-center gap-4"
      >
        <div class="flex flex-wrap items-center gap-3">
          <UAvatar
            :src="profile.avatar"
            :alt="profile.name"
            size="lg"
          />

          <UButton
            label="Choose"
            color="neutral"
            type="button"
            @click="onFileClick"
          />

          <input
            ref="fileRef"
            type="file"
            class="hidden"
            accept=".jpg,.jpeg,.png,.gif"
            @change="onFileChange"
          >
        </div>
      </UFormField>

      <USeparator />
    </UPageCard>
  </UForm>
</template>