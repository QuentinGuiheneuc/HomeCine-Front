<script setup lang="ts">
import { h, resolveComponent, ref, computed, onMounted } from 'vue'
import http from '@/src/lib/https'

definePageMeta({ middleware: 'admin' })

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

const toast = useToast()

const search = ref('')
const pending = ref(false)

const users = ref<any[]>([])

const isOpen = ref(false)
const isEditing = ref(false)

const isRevokeOpen = ref(false)
const revokeUser   = ref<any>(null)

const form = ref({
  id: null,
  name: '',
  email: '',
  type: 'user',
  password: ''
})

async function loadUsers() {
  try {
    pending.value = true

    const { data } = await http.get('/user/all')

    users.value = data.map((user: any) => ({
      ...user,
      parsedSettings: user.settings
        ? JSON.parse(user.settings)
        : {}
    }))
  } catch (err) {
    console.error(err)

    toast.add({
      title: 'Failed to load users',
      color: 'error'
    })
  } finally {
    pending.value = false
  }
}

onMounted(() => {
  loadUsers()
})

const filteredUsers = computed(() => {
  return users.value.filter((user) => {
    return (
      user.name?.toLowerCase().includes(search.value.toLowerCase()) ||
      user.email?.toLowerCase().includes(search.value.toLowerCase())
    )
  })
})

function openCreate() {
  isEditing.value = false

  form.value = {
    id: null,
    name: '',
    email: '',
    type: 'user',
    password: ''
  }

  isOpen.value = true
}

function openEdit(user: any) {
  isEditing.value = true

  form.value = {
    id: user.id,
    name: user.name,
    email: user.email,
    type: user.type,
    password: ''
  }

  isOpen.value = true
}

async function saveUser() {
  try {
    pending.value = true

    if (isEditing.value) {
      await http.put(`/user/${form.value.id}`, {
        name: form.value.name,
        email: form.value.email,
        type: form.value.type,
        password: form.value.password || undefined
      })

      toast.add({
        title: 'User updated',
        color: 'success'
      })
    } else {
      await http.post('/register', {
        name: form.value.name,
        email: form.value.email,
        type: form.value.type,
        password: form.value.password
      })

      toast.add({
        title: 'User created',
        color: 'success'
      })
    }

    isOpen.value = false

    await loadUsers()
  } catch (err) {
    console.error(err)

    toast.add({
      title: 'Failed to save user',
      color: 'error'
    })
  } finally {
    pending.value = false
  }
}

function openRevoke(user: any) {
  revokeUser.value  = user
  isRevokeOpen.value = true
}

async function revokeToken() {
  if (!revokeUser.value) return
  try {
    pending.value = true
    await http.post(`/admin/users/${revokeUser.value.id}/revoke-token`)
    toast.add({
      title: `Sessions révoquées`,
      description: `Toutes les sessions de ${revokeUser.value.email} ont été invalidées.`,
      color: 'warning'
    })
    isRevokeOpen.value = false
  } catch (err) {
    console.error(err)
    toast.add({ title: 'Failed to revoke token', color: 'error' })
  } finally {
    pending.value = false
  }
}

async function deleteUser(user: any) {
  const confirmDelete = confirm(
    `Delete user "${user.name}" ?`
  )

  if (!confirmDelete) {
    return
  }

  try {
    await http.delete(`/user/${user.id}`)

    toast.add({
      title: 'User deleted',
      color: 'success'
    })

    await loadUsers()
  } catch (err) {
    console.error(err)

    toast.add({
      title: 'Failed to delete user',
      color: 'error'
    })
  }
}

const columns = [
  {
    accessorKey: 'id',
    header: '#'
  },
  {
    accessorKey: 'name',
    header: 'Name'
  },
  {
    accessorKey: 'email',
    header: 'Email'
  },
  {
    accessorKey: 'type',
    header: 'Type',
    cell: ({ row }: any) => {
      // Supporte type:'admin'/'user' et admin:1/0 selon l'API
      const raw  = row.original.type
      const adm  = row.original.admin
      const type = raw ?? (adm === 1 || adm === true ? 'admin' : 'user')
      return h(UBadge, {
        label:   type,
        color:   type === 'admin' ? 'error' : 'success',
        variant: 'subtle'
      })
    }
  },
  {
    id: 'appearance',
    header: 'Theme',
    cell: ({ row }: any) => {
      return row.original.parsedSettings?.appearance || '-'
    }
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: ({ row }: any) => {
      return h('div', {
        class: 'flex gap-2'
      }, [
        h(UButton, {
          label: 'Edit',
          size: 'xs',
          color: 'neutral',
          variant: 'soft',
          onClick: () => openEdit(row.original)
        }),

        h(UButton, {
          label: 'Révoquer',
          size: 'xs',
          color: 'warning',
          variant: 'soft',
          icon: 'i-lucide-shield-off',
          onClick: () => openRevoke(row.original)
        }),

        h(UButton, {
          label: 'Delete',
          size: 'xs',
          color: 'error',
          variant: 'soft',
          onClick: () => deleteUser(row.original)
        })
      ])
    }
  }
]
</script>

<template>
  <div>
    <UPageCard
      title="Users"
      description="Manage users and permissions."
      variant="naked"
      orientation="horizontal"
      class="mb-4"
    >
      <div class="flex gap-2 lg:ms-auto">
        <UButton
          label="Refresh"
          color="neutral"
          :loading="pending"
          @click="loadUsers"
        />

        <UButton
          label="Add user"
          @click="openCreate"
        />
      </div>
    </UPageCard>

    <UPageCard
      variant="subtle"
      :ui="{
        container: 'p-0 sm:p-0 gap-y-0',
        wrapper: 'items-stretch',
        header: 'p-4 mb-0 border-b border-default'
      }"
    >
      <template #header>
        <UInput
          v-model="search"
          icon="i-lucide-search"
          placeholder="Search users"
          class="w-full"
        />
      </template>

      <UTable
        :data="filteredUsers"
        :columns="columns"
        :loading="pending"
      />
    </UPageCard>

    <UModal v-model:open="isOpen">
      <template #content>
        <div class="p-6 space-y-6">
          <!-- HEADER -->
          <div class="flex items-start justify-between">
            <div>
              <h2 class="text-2xl font-bold">
                {{ isEditing ? 'Edit user' : 'Create user' }}
              </h2>

              <p class="text-sm text-muted mt-1">
                {{
                  isEditing
                    ? 'Update account information, permissions and security settings.'
                    : 'Create a new user account and configure access permissions.'
                }}
              </p>
            </div>

            <UBadge
              :color="isEditing ? 'warning' : 'success'"
              variant="subtle"
              size="lg"
            >
              {{ isEditing ? 'Editing' : 'New User' }}
            </UBadge>
          </div>

          <!-- USER INFORMATIONS -->
          <div class="space-y-4">
            <div class="border-b border-default pb-2">
              <h3 class="font-semibold text-base">
                User information
              </h3>

              <p class="text-sm text-muted">
                Basic account identity and login credentials.
              </p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <UFormGroup
                label="Full name"
                description="Displayed in the application interface."
              >
                <UInput
                  v-model="form.name"
                  placeholder="Name of the user"
                  icon="i-lucide-user"
                />
              </UFormGroup>

              <UFormGroup
                label="Email / Login"
                description="Used for authentication."
              >
                <UInput
                  v-model="form.email"
                  placeholder="user@example.com"
                  icon="i-lucide-mail"
                />
              </UFormGroup>
            </div>
          </div>

          <!-- SECURITY -->
          <div class="space-y-4">
            <div class="border-b border-default pb-2">
              <h3 class="font-semibold text-base">
                Security
              </h3>

              <p class="text-sm text-muted">
                Manage password and account privileges.
              </p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <UFormGroup
                label="Password"
                :description="
                  isEditing
                    ? 'Leave empty to keep the current password.'
                    : 'Choose a secure password.'
                "
              >
                <UInput
                  v-model="form.password"
                  type="password"
                  placeholder="••••••••"
                  icon="i-lucide-lock"
                />
              </UFormGroup>

              <UFormGroup
                label="Account type"
                description="Defines user permissions."
              >
                <USelect
                  v-model="form.type"
                  :items="[
                    {
                      label: 'User',
                      value: 'user'
                    },
                    {
                      label: 'Admin',
                      value: 'admin'
                    }
                  ]"
                />
              </UFormGroup>
            </div>

            <!-- ROLE INFO -->
            <UAlert
              v-if="form.type === 'admin'"
              icon="i-lucide-shield-alert"
              color="warning"
              variant="subtle"
              title="Administrator access"
              description="This account will have full access to application settings and user management."
            />

            <UAlert
              v-else
              icon="i-lucide-user"
              color="neutral"
              variant="subtle"
              title="Standard access"
              description="This account will only have access to standard user features."
            />
          </div>

          <!-- SETTINGS -->
          <div class="space-y-4">
            <div class="border-b border-default pb-2">
              <h3 class="font-semibold text-base">
                Interface preferences
              </h3>

              <p class="text-sm text-muted">
                Configure default interface appearance.
              </p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <UFormGroup
                label="Theme"
                description="Default application appearance."
                class="col-span-1 md:col-span-1 sm:col-span-1"
              >
                <USelect
                  placeholder="Default"
                  variant="soft"
                  v-model="form.appearance"
                  :items="[
                    {
                      label: 'Dark',
                      value: 'dark'
                    },
                    {
                      label: 'Light',
                      value: 'light'
                    }
                  ]"
                />
              </UFormGroup>

              <UFormGroup
                label="Primary color"
                description="Main accent color."
                class="col-span-1 md:col-span-1 sm:col-span-1"
              >
                <USelect
                  variant="soft"
                  v-model="form.primary"
                  placeholder="Default"
                  :items="[
                    { label: 'Green', value: 'green' },
                    { label: 'Blue', value: 'blue' },
                    { label: 'Red', value: 'red' },
                    { label: 'Orange', value: 'orange' },
                    { label: 'Purple', value: 'purple' }
                  ]"
                />
              </UFormGroup>
            </div>
          </div>

          <!-- FOOTER -->
          <div class="flex justify-between items-center pt-4 border-t border-default">
            <div class="text-sm text-muted">
              {{
                isEditing
                  ? `Editing user #${form.id}`
                  : 'New account will be created immediately.'
              }}
            </div>

            <div class="flex gap-2">
              <UButton
                label="Cancel"
                color="neutral"
                variant="soft"
                icon="i-lucide-x"
                @click="isOpen = false"
              />

              <UButton
                :label="isEditing ? 'Save changes' : 'Create user'"
                :icon="isEditing
                  ? 'i-lucide-save'
                  : 'i-lucide-user-plus'"
                :loading="pending"
                @click="saveUser"
              />
            </div>
          </div>
        </div>
      </template>
    </UModal>
  </div>

  <!-- Modal révocation -->
  <UModal v-model:open="isRevokeOpen">
    <template #content>
      <div class="p-6 space-y-6">

        <!-- HEADER -->
        <div class="flex items-start justify-between">
          <div>
            <h2 class="text-2xl font-bold">Révoquer les sessions</h2>
            <p class="text-sm text-muted mt-1">
              Toutes les sessions actives de cet utilisateur seront immédiatement invalidées.
            </p>
          </div>
          <UBadge color="warning" variant="subtle" size="lg">
            Révocation
          </UBadge>
        </div>

        <!-- UTILISATEUR -->
        <div class="space-y-4">
          <div class="border-b border-default pb-2">
            <h3 class="font-semibold text-base">Utilisateur concerné</h3>
            <p class="text-sm text-muted">Le compte dont les sessions seront révoquées.</p>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <UFormGroup label="Nom">
              <UInput :model-value="revokeUser?.name || '—'" icon="i-lucide-user" disabled />
            </UFormGroup>
            <UFormGroup label="Email">
              <UInput :model-value="revokeUser?.email || '—'" icon="i-lucide-mail" disabled />
            </UFormGroup>
          </div>
        </div>

        <!-- AVERTISSEMENT -->
        <UAlert
          icon="i-lucide-shield-alert"
          color="warning"
          variant="subtle"
          title="Déconnexion forcée"
          description="L'utilisateur devra se reconnecter sur tous ses appareils. Les refresh tokens sont également invalidés."
        />

        <!-- FOOTER -->
        <div class="flex justify-between items-center pt-4 border-t border-default">
          <p class="text-sm text-muted">
            Utilisateur #{{ revokeUser?.id }}
          </p>
          <div class="flex gap-2">
            <UButton
              label="Annuler"
              color="neutral"
              variant="soft"
              icon="i-lucide-x"
              @click="isRevokeOpen = false"
            />
            <UButton
              label="Révoquer les sessions"
              color="warning"
              icon="i-lucide-shield-off"
              :loading="pending"
              @click="revokeToken"
            />
          </div>
        </div>

      </div>
    </template>
  </UModal>
</template>