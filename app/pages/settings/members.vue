<script setup lang="ts">
import { h, resolveComponent, ref, computed } from 'vue'

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

const search = ref('')

const users = ref([
  {
    id: 1,
    name: 'Quentin',
    email: 'quentin@mail.com',
    role: 'Admin',
    status: 'Active'
  },
  {
    id: 2,
    name: 'Lucas',
    email: 'lucas@mail.com',
    role: 'User',
    status: 'Inactive'
  },
  {
    id: 3,
    name: 'Emma',
    email: 'emma@mail.com',
    role: 'Moderator',
    status: 'Active'
  }
])

const filteredUsers = computed(() => {
  return users.value.filter((user) => {
    return (
      user.name.toLowerCase().includes(search.value.toLowerCase()) ||
      user.email.toLowerCase().includes(search.value.toLowerCase())
    )
  })
})

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
    accessorKey: 'role',
    header: 'Role'
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }: any) => {
      const status = row.original.status

      return h(
        UBadge,
        {
          color: status === 'Active' ? 'success' : 'neutral',
          variant: 'subtle'
        },
        () => status
      )
    }
  },
  {
    id: 'actions',
    header: '',
    cell: () => {
      return h(UButton, {
        label: 'Edit',
        color: 'neutral',
        variant: 'ghost',
        size: 'sm'
      })
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
      <UButton
        label="Add user"
        color="primary"
        class="w-fit lg:ms-auto"
      />
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
          autofocus
          class="w-full"
        />
      </template>

      <UTable
        :rows="filteredUsers"
        :columns="columns"
      />
    </UPageCard>
  </div>
</template>
